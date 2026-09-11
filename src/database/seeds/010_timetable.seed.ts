import type { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Assigns every class its subject teachers, then builds the weekly timetable.
 *
 * Kept separate from the activity seed because that one also invents
 * attendance, assessments and grades. The school's real marks are already in
 * `report_cards`, so generating a second set of grades beside them would put two
 * contradictory answers in the database. This seed writes only what a timetable
 * needs: `class_subjects` and `schedules`.
 *
 * Both steps are idempotent — the timetable for the year is cleared and rebuilt,
 * so a re-run after a staffing change produces a fresh, conflict-free week.
 */

/** Weekly periods each subject receives per class, following the MoEYS allocation. */
const PERIODS_PER_WEEK: Record<string, number> = {
  KHM: 6, MATH: 6, ENG: 3, PHY: 2, CHEM: 2, BIO: 2,
  EARTH: 1, HIST: 2, GEO: 2, CIVIC: 2,
};

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

/**
 * The Cambodian school day: four periods before the long midday break that the
 * heat makes necessary, and four after it.
 *
 * Eight slots over five days is forty a week against twenty-eight taught
 * periods. The slack is what lets a clash move somewhere else instead of
 * leaving a lesson with nowhere to go.
 */
const SLOTS: { start: string; end: string }[] = [
  { start: '07:00', end: '07:45' },
  { start: '08:00', end: '08:45' },
  { start: '09:00', end: '09:45' },
  { start: '10:00', end: '11:00' },
  { start: '13:00', end: '13:45' },
  { start: '14:00', end: '14:45' },
  { start: '15:00', end: '15:45' },
  { start: '16:00', end: '16:45' },
];

const PERIODS_PER_DAY = 8;

interface ClassRow { id: number; code: string; room_id: number | null }
interface Placement {
  classId: number; subjectId: number; teacherId: number | null; roomId: number | null;
  day: string; period: number; start: string; end: string;
}

export const seedTimetable = async (client: PoolClient): Promise<void> => {
  const year = await client.query<{ id: number; name: string; start_date: string; end_date: string }>(
    'SELECT id, name, start_date, end_date FROM academic_years WHERE is_active LIMIT 1',
  );

  if (year.rowCount === 0) {
    throw new Error('No active academic year. Set one before building a timetable.');
  }

  const { id: yearId, name: yearLabel } = year.rows[0];

  const classes = (
    await client.query<ClassRow>(
      `SELECT id, code, room_id FROM classes
        WHERE academic_year_id = $1 AND deleted_at IS NULL ORDER BY code`,
      [yearId],
    )
  ).rows;

  if (classes.length === 0) {
    throw new Error(`${yearLabel} has no classes to build a timetable for.`);
  }

  const subjects = (
    await client.query<{ id: number; code: string }>(
      'SELECT id, code FROM subjects WHERE deleted_at IS NULL ORDER BY code',
    )
  ).rows.filter((subject) => PERIODS_PER_WEEK[subject.code] !== undefined);

  /**
   * Who can teach what, from `teacher_subjects`.
   *
   * `periods` accumulates as assignments are handed out so each class subject
   * goes to whichever qualified teacher is carrying the least so far. Khmer and
   * Mathematics have three teachers each precisely because six periods across
   * eight classes is forty-eight, and a week holds only forty slots.
   */
  const staff = (
    await client.query<{ id: number; subject_code: string }>(
      `SELECT t.id, s.code AS subject_code
         FROM teachers t
         JOIN teacher_subjects ts ON ts.teacher_id = t.id
         JOIN subjects s ON s.id = ts.subject_id
        WHERE t.deleted_at IS NULL
        ORDER BY t.id`,
    )
  ).rows.map((row) => ({ id: row.id, subject: row.subject_code, periods: 0 }));

  // --- Who teaches what, in which class ------------------------------------
  await client.query(
    `DELETE FROM class_subjects
      WHERE class_id IN (SELECT id FROM classes WHERE academic_year_id = $1)`,
    [yearId],
  );

  const unstaffed: string[] = [];

  for (const schoolClass of classes) {
    for (const subject of subjects) {
      const candidates = staff.filter((member) => member.subject === subject.code);
      const teacher = candidates.length
        ? candidates.reduce((lightest, candidate) =>
            candidate.periods < lightest.periods ? candidate : lightest,
          )
        : null;

      if (!teacher) {
        unstaffed.push(`${schoolClass.code} ${subject.code}`);
      } else {
        teacher.periods += PERIODS_PER_WEEK[subject.code];
      }

      await client.query(
        `INSERT INTO class_subjects (class_id, subject_id, teacher_id, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (class_id, subject_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id`,
        [schoolClass.id, subject.id, teacher?.id ?? null],
      );

      if (teacher) {
        await client.query(
          `INSERT INTO teacher_classes (teacher_id, class_id, is_homeroom)
           VALUES ($1, $2, FALSE)
           ON CONFLICT (teacher_id, class_id) DO NOTHING`,
          [teacher.id, schoolClass.id],
        );
      }
    }
  }

  if (unstaffed.length) {
    logger.warn(
      `No qualified teacher for ${unstaffed.length} class subject(s): ${unstaffed.join(', ')}. ` +
        'Those periods are left off the timetable.',
    );
  }

  // --- The timetable --------------------------------------------------------
  await client.query('DELETE FROM schedules WHERE academic_year_id = $1', [yearId]);

  const pairs = (
    await client.query<{ class_id: number; subject_id: number; subject_code: string; teacher_id: number | null }>(
      `SELECT cs.class_id, cs.subject_id, s.code AS subject_code, cs.teacher_id
         FROM class_subjects cs
         JOIN subjects s ON s.id = cs.subject_id
         JOIN classes c ON c.id = cs.class_id
        WHERE c.academic_year_id = $1 AND c.deleted_at IS NULL AND cs.teacher_id IS NOT NULL`,
      [yearId],
    )
  ).rows;

  const remaining = new Map<string, number>();

  for (const pair of pairs) {
    remaining.set(`${pair.class_id}:${pair.subject_id}`, PERIODS_PER_WEEK[pair.subject_code] ?? 0);
  }

  /**
   * Place the tightest teachers first.
   *
   * A teacher covering all eight classes needs their slots while the week is
   * still mostly empty. Filling class by class instead leaves the heaviest
   * subjects fighting over the scraps, so the order here is by how much of a
   * teacher's week the assignment demands, heaviest first.
   */
  const pressure = new Map<number, number>();

  for (const pair of pairs) {
    const owed = PERIODS_PER_WEEK[pair.subject_code] ?? 0;
    pressure.set(pair.teacher_id as number, (pressure.get(pair.teacher_id as number) ?? 0) + owed);
  }

  const ordered = [...pairs].sort(
    (a, b) => (pressure.get(b.teacher_id as number) ?? 0) - (pressure.get(a.teacher_id as number) ?? 0),
  );

  const busyTeacher = new Set<string>();
  const busyClass = new Set<string>();
  const busyRoom = new Set<string>();
  /** How many periods a class already has on a given day. */
  const dayLoad = new Map<string, number>();
  /** How many times a class already has a subject on a given day. */
  const subjectOnDay = new Map<string, number>();
  const placements: Placement[] = [];

  const week = WEEKDAYS.flatMap((day) =>
    Array.from({ length: PERIODS_PER_DAY }, (_, index) => ({ day, period: index + 1 })),
  );

  /**
   * Twenty-eight periods over five days is 5.6, so six a day spreads them as
   * evenly as whole lessons allow. Without this cap a greedy scan fills Monday
   * and Tuesday to the brim and leaves Friday with two lessons.
   */
  const EVEN_DAY_CAP = Math.ceil(
    Object.values(PERIODS_PER_WEEK).reduce((sum, n) => sum + n, 0) / WEEKDAYS.length,
  );

  /** No class should meet the same subject more than twice in one day. */
  const SUBJECT_PER_DAY_CAP = 2;

  const free = (
    pair: (typeof pairs)[number],
    schoolClass: ClassRow,
    day: string,
    period: number,
  ): boolean =>
    !busyClass.has(`${pair.class_id}:${day}:${period}`) &&
    !busyTeacher.has(`${pair.teacher_id}:${day}:${period}`) &&
    (schoolClass.room_id === null || !busyRoom.has(`${schoolClass.room_id}:${day}:${period}`));

  const place = (
    pair: (typeof pairs)[number],
    schoolClass: ClassRow,
    day: string,
    period: number,
  ): void => {
    busyClass.add(`${pair.class_id}:${day}:${period}`);
    busyTeacher.add(`${pair.teacher_id}:${day}:${period}`);

    if (schoolClass.room_id !== null) {
      busyRoom.add(`${schoolClass.room_id}:${day}:${period}`);
    }

    const dayKey = `${pair.class_id}:${day}`;
    const subjectKey = `${pair.class_id}:${pair.subject_id}:${day}`;
    dayLoad.set(dayKey, (dayLoad.get(dayKey) ?? 0) + 1);
    subjectOnDay.set(subjectKey, (subjectOnDay.get(subjectKey) ?? 0) + 1);

    const slot = SLOTS[period - 1];
    placements.push({
      classId: pair.class_id,
      subjectId: pair.subject_id,
      teacherId: pair.teacher_id,
      roomId: schoolClass.room_id,
      day,
      period,
      start: slot.start,
      end: slot.end,
    });
  };

  /**
   * Choose a slot rather than take the first that fits.
   *
   * Scanning the week in order produces a legal timetable and a miserable one:
   * every class ends up front-loaded, and a subject with six periods lands four
   * times on one day. Scoring each candidate instead — emptiest day first, then
   * the day where this subject is least present — spreads lessons across the
   * week without any extra passes.
   *
   * `dayCap` and `subjectCap` are relaxed only if nothing fits, so the tight
   * rules hold for almost every lesson and bend for the last few.
   */
  const bestSlot = (
    pair: (typeof pairs)[number],
    schoolClass: ClassRow,
    dayCap: number,
    subjectCap: number,
  ): { day: string; period: number } | null => {
    let best: { day: string; period: number; score: number } | null = null;

    for (const { day, period } of week) {
      if (!free(pair, schoolClass, day, period)) {
        continue;
      }

      const onDay = dayLoad.get(`${pair.class_id}:${day}`) ?? 0;
      const sameSubject = subjectOnDay.get(`${pair.class_id}:${pair.subject_id}:${day}`) ?? 0;

      if (onDay >= dayCap || sameSubject >= subjectCap) {
        continue;
      }

      // Emptiest day wins; then the day carrying least of this subject; then
      // the earliest period, so the day fills from the top and leaves no holes.
      const score = onDay * 1000 + sameSubject * 100 + period;

      if (!best || score < best.score) {
        best = { day, period, score };
      }
    }

    return best ? { day: best.day, period: best.period } : null;
  };

  for (const pair of ordered) {
    const schoolClass = classes.find((entry) => entry.id === pair.class_id);

    if (!schoolClass) {
      continue;
    }

    const key = `${pair.class_id}:${pair.subject_id}`;
    let owed = remaining.get(key) ?? 0;

    while (owed > 0) {
      const slot =
        bestSlot(pair, schoolClass, EVEN_DAY_CAP, SUBJECT_PER_DAY_CAP) ??
        bestSlot(pair, schoolClass, PERIODS_PER_DAY, SUBJECT_PER_DAY_CAP) ??
        bestSlot(pair, schoolClass, PERIODS_PER_DAY, PERIODS_PER_DAY);

      if (!slot) {
        break;
      }

      place(pair, schoolClass, slot.day, slot.period);
      owed -= 1;
    }

    remaining.set(key, owed);
  }

  for (const placement of placements) {
    await client.query(
      `INSERT INTO schedules (academic_year_id, class_id, subject_id, teacher_id, room_id,
                              day_of_week, period_number, start_time, end_time, is_active)
       VALUES ($1, $2, $3, $4, $5, $6::weekday, $7, $8::time, $9::time, TRUE)`,
      [
        yearId, placement.classId, placement.subjectId, placement.teacherId, placement.roomId,
        placement.day, placement.period, placement.start, placement.end,
      ],
    );
  }

  const owedTotal = [...remaining.values()].reduce((sum, value) => sum + value, 0);
  const wanted = placements.length + owedTotal;

  logger.info(
    `Timetable for ${yearLabel}: ${placements.length} of ${wanted} period(s) placed ` +
      `across ${classes.length} classes`,
  );

  if (owedTotal > 0) {
    logger.warn(`${owedTotal} period(s) could not be placed — the week is too tight.`);
  }

  const loads = [...pressure.entries()].map(([, periods]) => periods).sort((a, b) => a - b);

  logger.info(
    `Teacher load: lightest ${loads[0]}, heaviest ${loads[loads.length - 1]} of ` +
      `${PERIODS_PER_DAY * WEEKDAYS.length} slots a week`,
  );
};
