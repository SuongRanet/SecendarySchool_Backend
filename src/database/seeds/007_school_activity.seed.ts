import type { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * The school's daily life for the year already under way: a timetable, the
 * attendance register for every day since term started, the assessments the
 * teachers have set and the grades that follow from them.
 *
 * The academic year is moved to start in June so that "today" falls inside term
 * one — a register cannot be taken for a day that has not happened, so without
 * that shift there would be nothing to show.
 *
 * Generated from a fixed seed, so a second run reproduces the same year rather
 * than inventing a different one.
 */

const makeRandom = (seed: number) => {
  let state = seed >>> 0;

  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Weekly periods per subject, the same allocation the staffing was built on. */
const PERIODS_PER_WEEK: Record<string, number> = {
  KHM: 6, MATH: 6, ENG: 3, PHY: 2, CHEM: 2, BIO: 2,
  EARTH: 1, HIST: 2, GEO: 2, CIVIC: 2,
};

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

/**
 * The Cambodian school day: four periods in the morning and four in the
 * afternoon, each starting on the hour and running 45 minutes, with the long
 * midday break between 11:00 and 13:00 that the heat makes necessary.
 *
 * Eight slots over five days gives 40 a week against 28 taught periods. The
 * slack is deliberate — with an exactly full week a single teacher clash leaves
 * a period with nowhere to go.
 */
const SLOTS: { start: string; end: string }[] = [
  // Morning
  { start: '07:00', end: '07:45' },
  { start: '08:00', end: '08:45' },
  { start: '09:00', end: '09:45' },
  { start: '10:00', end: '11:00' },
  // Afternoon
  { start: '13:00', end: '13:45' },
  { start: '14:00', end: '14:45' },
  { start: '15:00', end: '15:45' },
  { start: '16:00', end: '16:45' },
];

const PERIODS_PER_DAY: Record<string, number> = {
  MONDAY: 8, TUESDAY: 8, WEDNESDAY: 8, THURSDAY: 8, FRIDAY: 8,
};

const iso = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
};

/** Every Monday-to-Friday date in the range, inclusive. */
const schoolDays = (from: Date, to: Date): string[] => {
  const days: string[] = [];

  for (let day = new Date(from); day <= to; day = addDays(day, 1)) {
    const weekday = day.getUTCDay();

    if (weekday >= 1 && weekday <= 5) {
      days.push(iso(day));
    }
  }

  return days;
};

interface ClassRow {
  id: number;
  code: string;
  room_id: number | null;
}

interface ClassSubjectRow {
  class_id: number;
  subject_id: number;
  subject_code: string;
  teacher_id: number | null;
}

export const seedSchoolActivity = async (client: PoolClient): Promise<void> => {
  const random = makeRandom(70707);

  // --- Put the year around today -------------------------------------------
  const year = await client.query<{ id: number; name: string }>(
    'SELECT id, name FROM academic_years WHERE is_active = TRUE ORDER BY id LIMIT 1',
  );

  if (year.rowCount === 0) {
    throw new Error('No active academic year to build activity for.');
  }

  const academicYearId = year.rows[0].id;
  const today = new Date(`${iso(new Date())}T00:00:00Z`);

  // Term one runs from June, so the register has real days behind it.
  const yearStart = '2026-06-01';
  const yearEnd = '2027-04-30';
  const term1End = '2026-10-31';

  await client.query(
    `UPDATE academic_years SET start_date = $2, end_date = $3, status = 'ACTIVE' WHERE id = $1`,
    [academicYearId, yearStart, yearEnd],
  );

  // Enrolments must not predate the year they belong to.
  await client.query(
    'UPDATE enrollments SET enrolled_date = $2 WHERE academic_year_id = $1 AND enrolled_date > $2',
    [academicYearId, yearStart],
  );

  await client.query(
    `INSERT INTO academic_terms (academic_year_id, name, term_order, start_date, end_date, is_active)
     VALUES ($1, 'Term 1', 1, $2, $3, TRUE),
            ($1, 'Term 2', 2, $4, $5, FALSE)
     ON CONFLICT (academic_year_id, term_order) DO UPDATE
       SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
           is_active = EXCLUDED.is_active`,
    [academicYearId, yearStart, term1End, '2026-11-01', yearEnd],
  );

  const term1 = (
    await client.query<{ id: number }>(
      'SELECT id FROM academic_terms WHERE academic_year_id = $1 AND term_order = 1',
      [academicYearId],
    )
  ).rows[0].id;

  // --- The timetable --------------------------------------------------------
  const classes = (
    await client.query<ClassRow>(
      `SELECT id, code, room_id FROM classes
        WHERE academic_year_id = $1 AND deleted_at IS NULL ORDER BY code`,
      [academicYearId],
    )
  ).rows;

  const classSubjects = (
    await client.query<ClassSubjectRow>(
      `SELECT cs.class_id, cs.subject_id, s.code AS subject_code, cs.teacher_id
         FROM class_subjects cs
         JOIN subjects s ON s.id = cs.subject_id
         JOIN classes c ON c.id = cs.class_id
        WHERE c.academic_year_id = $1 AND c.deleted_at IS NULL`,
      [academicYearId],
    )
  ).rows;

  await client.query(
    `DELETE FROM schedules WHERE academic_year_id = $1`,
    [academicYearId],
  );

  // How many periods each class still owes each subject this week.
  const remaining = new Map<string, number>();

  for (const row of classSubjects) {
    remaining.set(`${row.class_id}:${row.subject_id}`, PERIODS_PER_WEEK[row.subject_code] ?? 0);
  }

  const busyTeacher = new Set<string>();
  const busyClass = new Set<string>();
  // Which subjects a class already has on a given day, to spread them out.
  const subjectOnDay = new Set<string>();
  const periods: {
    classId: number; subjectId: number; teacherId: number | null; roomId: number | null;
    day: string; period: number; start: string; end: string;
  }[] = [];

  /**
   * Place the tightest teachers first.
   *
   * Every subject is taught by one named teacher covering all eight classes, so
   * English — three periods in each — needs 24 of the week's 40 slots, and can
   * only get them while the week is still mostly empty. Filling slot by slot
   * instead left the heaviest subjects fighting for the scraps and a handful of
   * periods with nowhere to go, so the order here is by how much of a teacher's
   * week each subject demands, heaviest first.
   */
  const pressure = new Map<number, number>();

  for (const row of classSubjects) {
    const needed = PERIODS_PER_WEEK[row.subject_code] ?? 0;
    pressure.set(row.teacher_id ?? 0, (pressure.get(row.teacher_id ?? 0) ?? 0) + needed);
  }

  const ordered = [...classSubjects].sort(
    (a, b) => (pressure.get(b.teacher_id ?? 0) ?? 0) - (pressure.get(a.teacher_id ?? 0) ?? 0),
  );

  for (const row of ordered) {
    const key = `${row.class_id}:${row.subject_id}`;
    const schoolClass = classes.find((entry) => entry.id === row.class_id);

    if (!schoolClass) {
      continue;
    }

    let owed = remaining.get(key) ?? 0;

    // Every class starts scanning from a different point in the week. Without
    // the offset each class grabs Monday first, and a teacher who takes all
    // eight classes collides with themselves eight times over.
    const classOffset = classes.findIndex((entry) => entry.id === row.class_id) * 3;
    const week = WEEKDAYS.flatMap((day) =>
      Array.from({ length: PERIODS_PER_DAY[day] }, (_, index) => ({ day, period: index + 1 })),
    );

    // Two sweeps. The first refuses to give a class the same subject twice in a
    // day, which is what stops a timetable reading "ICT, ICT, PE, PE"; the
    // second drops that preference for whatever is left, since a subject with
    // six periods a week has to double up somewhere.
    for (let sweep = 0; sweep < 2 && owed > 0; sweep += 1) {
      for (let step = 0; step < week.length && owed > 0; step += 1) {
        const { day, period } = week[(step + classOffset) % week.length];

        if (
          busyClass.has(`${row.class_id}:${day}:${period}`) ||
          busyTeacher.has(`${row.teacher_id}:${day}:${period}`)
        ) {
          continue;
        }

        if (sweep === 0 && subjectOnDay.has(`${row.class_id}:${row.subject_id}:${day}`)) {
          continue;
        }

        busyClass.add(`${row.class_id}:${day}:${period}`);
        busyTeacher.add(`${row.teacher_id}:${day}:${period}`);
        subjectOnDay.add(`${row.class_id}:${row.subject_id}:${day}`);
        owed -= 1;

        const slot = SLOTS[period - 1];
        periods.push({
          classId: row.class_id,
          subjectId: row.subject_id,
          teacherId: row.teacher_id,
          roomId: schoolClass.room_id,
          day,
          period,
          start: slot.start,
          end: slot.end,
        });
      }
    }

    remaining.set(key, owed);
  }

  // A greedy first pass leaves a handful of periods homeless, because the slot
  // it wanted was already taken by the same teacher in another class. Sweep the
  // whole week once more for each leftover and drop it wherever both the class
  // and the teacher are actually free.
  for (const [key, owed] of remaining) {
    if (owed <= 0) {
      continue;
    }

    const [classIdText, subjectIdText] = key.split(':');
    const classId = Number(classIdText);
    const subjectId = Number(subjectIdText);
    const owner = classSubjects.find(
      (row) => row.class_id === classId && row.subject_id === subjectId,
    );
    const schoolClass = classes.find((row) => row.id === classId);

    if (!owner || !schoolClass) {
      continue;
    }

    let left = owed;

    for (const day of WEEKDAYS) {
      for (let period = 1; period <= PERIODS_PER_DAY[day] && left > 0; period += 1) {
        if (
          busyClass.has(`${classId}:${day}:${period}`) ||
          busyTeacher.has(`${owner.teacher_id}:${day}:${period}`)
        ) {
          continue;
        }

        busyClass.add(`${classId}:${day}:${period}`);
        busyTeacher.add(`${owner.teacher_id}:${day}:${period}`);
        left -= 1;

        const slot = SLOTS[period - 1];
        periods.push({
          classId,
          subjectId,
          teacherId: owner.teacher_id,
          roomId: schoolClass.room_id,
          day,
          period,
          start: slot.start,
          end: slot.end,
        });
      }
    }

    remaining.set(key, left);
  }

  for (const entry of periods) {
    await client.query(
      `INSERT INTO schedules (academic_year_id, class_id, subject_id, teacher_id, room_id,
                              day_of_week, period_number, start_time, end_time,
                              effective_from, is_active)
       VALUES ($1, $2, $3, $4, $5, $6::weekday, $7, $8, $9, $10, TRUE)`,
      [
        academicYearId, entry.classId, entry.subjectId, entry.teacherId, entry.roomId,
        entry.day, entry.period, entry.start, entry.end, yearStart,
      ],
    );
  }

  const unplaced = [...remaining.values()].reduce((sum, value) => sum + value, 0);

  // --- The attendance register ---------------------------------------------
  const enrollments = (
    await client.query<{ id: number; student_id: number; class_id: number }>(
      `SELECT id, student_id, class_id FROM enrollments
        WHERE academic_year_id = $1 AND status = 'ACTIVE'`,
      [academicYearId],
    )
  ).rows;

  const reasons = (
    await client.query<{ id: number; code: string }>('SELECT id, code FROM attendance_reasons')
  ).rows;

  const sickReason = reasons.find((row) => /SICK|ILL/i.test(row.code))?.id ?? reasons[0]?.id ?? null;

  await client.query('DELETE FROM attendance WHERE academic_year_id = $1', [academicYearId]);

  const days = schoolDays(new Date(`${yearStart}T00:00:00Z`), today);
  const byClass = new Map<number, typeof enrollments>();

  for (const enrollment of enrollments) {
    byClass.set(enrollment.class_id, [...(byClass.get(enrollment.class_id) ?? []), enrollment]);
  }

  let attendanceRows = 0;

  for (const day of days) {
    for (const [classId, roll] of byClass) {
      const values: string[] = [];
      const params: unknown[] = [];

      for (const enrollment of roll) {
        // A believable register: most present, a few late, fewer absent.
        const draw = random();
        const status =
          draw < 0.93 ? 'PRESENT' : draw < 0.962 ? 'LATE' : draw < 0.985 ? 'ABSENT' : 'EXCUSED';

        const base = params.length;
        params.push(
          enrollment.student_id, classId, enrollment.id, academicYearId, day, status,
          status === 'LATE' ? 5 + Math.floor(random() * 25) : null,
          status === 'EXCUSED' ? sickReason : null,
        );
        values.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ` +
            `$${base + 6}::attendance_status, $${base + 7}, $${base + 8})`,
        );
      }

      if (values.length === 0) {
        continue;
      }

      await client.query(
        `INSERT INTO attendance (student_id, class_id, enrollment_id, academic_year_id,
                                 attendance_date, status, minutes_late, reason_id)
         VALUES ${values.join(', ')}`,
        params,
      );

      attendanceRows += values.length;
    }
  }

  // --- Assessments and their results ---------------------------------------
  await client.query(
    `DELETE FROM assessments WHERE academic_year_id = $1`,
    [academicYearId],
  );

  /** What each class has been set so far this term, and what it is worth. */
  const PLAN: { type: string; title: string; max: number; weeksIn: number }[] = [
    { type: 'HOMEWORK', title: 'Homework 1', max: 20, weeksIn: 3 },
    { type: 'QUIZ', title: 'Quiz 1', max: 50, weeksIn: 6 },
    { type: 'MIDTERM', title: 'Midterm', max: 100, weeksIn: 10 },
  ];

  const classSubjectIds = (
    await client.query<{ id: number; class_id: number; subject_id: number; teacher_id: number | null }>(
      `SELECT cs.id, cs.class_id, cs.subject_id, cs.teacher_id
         FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
        WHERE c.academic_year_id = $1 AND c.deleted_at IS NULL`,
      [academicYearId],
    )
  ).rows;

  let assessmentCount = 0;
  let resultCount = 0;

  // Each student carries an ability, so their marks hang together across
  // subjects instead of being noise.
  const ability = new Map<number, number>();

  for (const enrollment of enrollments) {
    ability.set(enrollment.student_id, 0.55 + random() * 0.4);
  }

  for (const cs of classSubjectIds) {
    const roll = byClass.get(cs.class_id) ?? [];

    for (const plan of PLAN) {
      const date = iso(addDays(new Date(`${yearStart}T00:00:00Z`), plan.weeksIn * 7));

      if (new Date(`${date}T00:00:00Z`) > today) {
        continue;
      }

      const assessment = await client.query<{ id: number }>(
        `INSERT INTO assessments (academic_year_id, term_id, class_id, subject_id,
                                  class_subject_id, teacher_id, title, type, max_score,
                                  assessment_date, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::assessment_type, $9, $10, TRUE)
         RETURNING id`,
        [
          academicYearId, term1, cs.class_id, cs.subject_id, cs.id, cs.teacher_id,
          plan.title, plan.type, plan.max, date,
        ],
      );

      assessmentCount += 1;

      const values: string[] = [];
      const params: unknown[] = [];

      for (const enrollment of roll) {
        const skill = ability.get(enrollment.student_id) ?? 0.7;
        // A little noise around the student's usual level, kept inside the paper.
        const fraction = Math.min(1, Math.max(0.15, skill + (random() - 0.5) * 0.25));
        const absent = random() < 0.02;
        const base = params.length;

        params.push(
          assessment.rows[0].id,
          enrollment.student_id,
          enrollment.id,
          absent ? null : Number((fraction * plan.max).toFixed(1)),
          absent,
        );
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, NOW())`);
      }

      if (values.length === 0) {
        continue;
      }

      await client.query(
        `INSERT INTO assessment_results (assessment_id, student_id, enrollment_id, score,
                                         is_absent, graded_at)
         VALUES ${values.join(', ')}`,
        params,
      );

      resultCount += values.length;
    }
  }

  // --- Grades ---------------------------------------------------------------
  // Built from the results above using the school's own weighting, so what the
  // grade screen shows agrees with what the assessments say.
  await client.query(
    'DELETE FROM grades WHERE academic_year_id = $1 AND term_id = $2',
    [academicYearId, term1],
  );

  const scheme = (
    await client.query<{ id: number }>(
      'SELECT id FROM grading_schemes WHERE is_default = TRUE LIMIT 1',
    )
  ).rows[0];

  const gradeCount = await client.query<{ count: string }>(
    `WITH weights AS (
       SELECT assessment_type, weight_percent
         FROM grading_scheme_components WHERE grading_scheme_id = $3
     ),
     earned AS (
       SELECT r.student_id, a.class_id, a.subject_id, a.type,
              SUM(COALESCE(r.score, 0)) AS score,
              SUM(a.max_score) AS possible
         FROM assessment_results r
         JOIN assessments a ON a.id = r.assessment_id
        WHERE a.academic_year_id = $1 AND a.term_id = $2
        GROUP BY r.student_id, a.class_id, a.subject_id, a.type
     ),
     weighted AS (
       SELECT e.student_id, e.class_id, e.subject_id,
              SUM((e.score / NULLIF(e.possible, 0)) * 100 * w.weight_percent) /
                NULLIF(SUM(w.weight_percent), 0) AS percentage
         FROM earned e JOIN weights w ON w.assessment_type = e.type
        GROUP BY e.student_id, e.class_id, e.subject_id
     )
     INSERT INTO grades (student_id, enrollment_id, academic_year_id, term_id, class_id,
                         subject_id, grading_scheme_id, score, max_score, percentage,
                         letter_grade, performance, gpa_point, is_final, calculated_at)
     SELECT w.student_id, en.id, $1, $2, w.class_id, w.subject_id, $3,
            ROUND(w.percentage, 2), 100, ROUND(w.percentage, 2),
            gs.letter_grade, gs.performance, gs.gpa_point, FALSE, NOW()
       FROM weighted w
       JOIN enrollments en ON en.student_id = w.student_id
                          AND en.academic_year_id = $1 AND en.status = 'ACTIVE'
       LEFT JOIN grade_scales gs ON gs.grading_scheme_id = $3
                                AND w.percentage BETWEEN gs.min_score AND gs.max_score
      WHERE w.percentage IS NOT NULL
     RETURNING '1' AS count`,
    [academicYearId, term1, scheme.id],
  );

  // Class rank per subject, which the report card shows.
  await client.query(
    `UPDATE grades g
        SET rank_in_class = ranked.position
       FROM (
         SELECT id, RANK() OVER (PARTITION BY class_id, subject_id ORDER BY percentage DESC) AS position
           FROM grades WHERE academic_year_id = $1 AND term_id = $2
       ) ranked
      WHERE g.id = ranked.id`,
    [academicYearId, term1],
  );

  logger.info(
    `Timetable: ${periods.length} periods across ${classes.length} classes` +
      (unplaced > 0 ? `, ${unplaced} could not be placed` : ', every period placed'),
  );
  logger.info(`Attendance: ${attendanceRows} records over ${days.length} school days`);
  logger.info(`Assessments: ${assessmentCount} set, ${resultCount} marks recorded`);
  logger.info(`Grades: ${gradeCount.rowCount} subject grades calculated for Term 1`);
};
