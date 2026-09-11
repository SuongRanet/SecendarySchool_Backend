import type { PoolClient } from 'pg';
import { hashPassword } from '../../utils/password';
import { logger } from '../../utils/logger';

/**
 * Fills the parts of the school the roster and timetable seeds leave empty:
 * guardians, the daily register, marks, homework, exams and announcements.
 *
 * The one rule that shapes everything here is that the school's real results
 * already exist. `report_cards` holds the average each pupil actually scored in
 * each semester, transcribed from the printed achievement sheets, so marks are
 * not invented freely — they are generated to reproduce those averages. A pupil
 * who really averaged 39.58 out of 50 gets subject marks that weight back to
 * about 79%, and the grade pages therefore agree with the paper the school
 * issued rather than contradicting it.
 *
 * Everything is drawn from a fixed seed, so a re-run produces the same school.
 */

export const GUARDIAN_PASSWORD = 'School123!';

const makeRandom = (seed: number) => {
  let state = seed >>> 0;

  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const GIVEN_MALE: [string, string][] = [
  ['ចាន់ថា', 'Chantha'], ['សុភី', 'Sophy'], ['រតនៈ', 'Ratanak'], ['ពិសិដ្ឋ', 'Piseth'],
  ['សំអាង', 'Samang'], ['វុទ្ធី', 'Vuthy'], ['ដារ៉ា', 'Dara'], ['សុវណ្ណ', 'Sovann'],
  ['គីមឡុង', 'Kimlong'], ['ប៊ុនធឿន', 'Bunthoeun'], ['សុផល', 'Sophal'], ['ចន្ថូ', 'Chanthou'],
  ['នរិន្ទ', 'Norin'], ['សិរីវុទ្ធ', 'Sereivuth'], ['កុសល', 'Kosal'], ['ភិរុណ', 'Phirun'],
];

const GIVEN_FEMALE: [string, string][] = [
  ['សុគន្ធា', 'Sokuntha'], ['បុប្ផា', 'Bopha'], ['ចន្នារី', 'Channary'], ['ធារី', 'Theary'],
  ['ម៉ាលី', 'Maly'], ['សុជាតា', 'Sochata'], ['នារី', 'Nary'], ['រស្មី', 'Raksmey'],
  ['ស្រីពៅ', 'Sreypov'], ['ចន្ទ្រា', 'Chantrea'], ['ធីតា', 'Thida'], ['សុភាព', 'Sopheap'],
  ['កញ្ញា', 'Kanha'], ['មុលិកា', 'Molika'], ['ពិសី', 'Pisey'], ['វណ្ណា', 'Vanna'],
];

const OCCUPATIONS = [
  'Farmer', 'Trader', 'Teacher', 'Driver', 'Tailor', 'Shop owner', 'Nurse',
  'Carpenter', 'Mechanic', 'Fisher', 'Civil servant', 'Market seller',
];

/** Weekly periods per subject, which is also how heavily each is assessed. */
const PERIODS_PER_WEEK: Record<string, number> = {
  KHM: 6, MATH: 6, ENG: 3, PHY: 2, CHEM: 2, BIO: 2,
  EARTH: 1, HIST: 2, GEO: 2, CIVIC: 2,
};

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

const iso = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
};

/** Every Monday-to-Friday date in the range, inclusive, that has already happened. */
const schoolDays = (from: string, to: string): string[] => {
  const days: string[] = [];
  const today = iso(new Date());
  const last = to < today ? to : today;

  for (let day = new Date(`${from}T00:00:00Z`); iso(day) <= last; day = addDays(day, 1)) {
    const weekday = day.getUTCDay();

    if (weekday >= 1 && weekday <= 5) {
      days.push(iso(day));
    }
  }

  return days;
};

/**
 * Inserts many rows in batches rather than one statement per row.
 *
 * The register alone runs to tens of thousands of rows; sending those one at a
 * time turns a two-second seed into a two-minute one.
 */
const insertMany = async (
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  casts: Record<number, string> = {},
): Promise<void> => {
  const CHUNK = 500;

  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value, index) => {
        values.push(value);
        const cast = casts[index] ? `::${casts[index]}` : '';

        return `$${values.length}${cast}`;
      });

      return `(${placeholders.join(', ')})`;
    });

    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
      values,
    );
  }
};

export const seedSchoolLife = async (client: PoolClient): Promise<void> => {
  const random = makeRandom(11111);
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];

  const year = (
    await client.query<{ id: number; name: string; start_date: string; end_date: string }>(
      'SELECT id, name, start_date, end_date FROM academic_years WHERE is_active LIMIT 1',
    )
  ).rows[0];

  if (!year) {
    throw new Error('No active academic year to fill.');
  }

  const yearId = year.id;
  const terms = (
    await client.query<{ id: number; term_order: number; start_date: string; end_date: string }>(
      `SELECT id, term_order, start_date::text, end_date::text FROM academic_terms
        WHERE academic_year_id = $1 ORDER BY term_order`,
      [yearId],
    )
  ).rows;

  const admin = (
    await client.query<{ id: number }>(
      `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE r.code IN ('SUPER_ADMIN', 'ADMIN') ORDER BY u.id LIMIT 1`,
    )
  ).rows[0]?.id ?? null;

  const enrolments = (
    await client.query<{
      enrollment_id: number; student_id: number; class_id: number;
      class_code: string; last_kh: string; last_en: string;
    }>(
      `SELECT e.id AS enrollment_id, e.student_id, e.class_id, c.code AS class_code,
              s.last_name_kh AS last_kh, s.last_name_en AS last_en
         FROM enrollments e
         JOIN classes c ON c.id = e.class_id
         JOIN students s ON s.id = e.student_id
        WHERE e.academic_year_id = $1 AND e.status = 'ACTIVE'
        ORDER BY c.code, e.roll_number`,
      [yearId],
    )
  ).rows;

  const classSubjects = (
    await client.query<{
      class_id: number; class_code: string; subject_id: number;
      subject_code: string; subject_name: string; teacher_id: number | null;
    }>(
      `SELECT cs.class_id, c.code AS class_code, cs.subject_id, s.code AS subject_code,
              s.name_en AS subject_name, cs.teacher_id
         FROM class_subjects cs
         JOIN classes c ON c.id = cs.class_id
         JOIN subjects s ON s.id = cs.subject_id
        WHERE c.academic_year_id = $1 AND cs.teacher_id IS NOT NULL
        ORDER BY c.code, s.code`,
      [yearId],
    )
  ).rows;

  const classes = (
    await client.query<{ id: number; code: string; room_id: number | null; homeroom_teacher_id: number | null }>(
      `SELECT id, code, room_id, homeroom_teacher_id FROM classes
        WHERE academic_year_id = $1 AND deleted_at IS NULL ORDER BY code`,
      [yearId],
    )
  ).rows;

  const studentsByClass = new Map<number, typeof enrolments>();

  for (const row of enrolments) {
    studentsByClass.set(row.class_id, [...(studentsByClass.get(row.class_id) ?? []), row]);
  }

  /**
   * Each pupil's real semester average, as a percentage of the 50-mark scale.
   * This is what every generated mark is calibrated against.
   */
  const realAverage = new Map<string, number>();

  for (const row of (
    await client.query<{ student_id: number; term_id: number | null; average_score: string }>(
      `SELECT student_id, term_id, average_score FROM report_cards
        WHERE academic_year_id = $1 AND average_score IS NOT NULL`,
      [yearId],
    )
  ).rows) {
    // `average_score` is stored as a percentage, so it is used as it stands.
    realAverage.set(`${row.student_id}:${row.term_id ?? 'year'}`, Number(row.average_score));
  }

  // --- Clear what this seed owns -------------------------------------------
  for (const sql of [
    `DELETE FROM notification_recipients`,
    `DELETE FROM notifications`,
    `DELETE FROM announcements WHERE academic_year_id = $1`,
    `DELETE FROM student_comments WHERE academic_year_id = $1`,
    `DELETE FROM student_behaviors WHERE academic_year_id = $1`,
    `DELETE FROM submissions WHERE assignment_id IN (SELECT id FROM assignments WHERE academic_year_id = $1)`,
    `DELETE FROM assignments WHERE academic_year_id = $1`,
    `DELETE FROM exam_results WHERE exam_id IN (SELECT id FROM exams WHERE academic_year_id = $1)`,
    `DELETE FROM exams WHERE academic_year_id = $1`,
    `DELETE FROM report_card_subjects WHERE report_card_id IN (SELECT id FROM report_cards WHERE academic_year_id = $1)`,
    `DELETE FROM grade_history WHERE grade_id IN (SELECT id FROM grades WHERE academic_year_id = $1)`,
    `DELETE FROM grades WHERE academic_year_id = $1`,
    `DELETE FROM assessment_results WHERE assessment_id IN (SELECT id FROM assessments WHERE academic_year_id = $1)`,
    `DELETE FROM assessments WHERE academic_year_id = $1`,
    `DELETE FROM attendance WHERE academic_year_id = $1`,
    `DELETE FROM student_parents`,
    `DELETE FROM parents`,
  ]) {
    await client.query(sql, sql.includes('$1') ? [yearId] : []);
  }

  // --- Guardians ------------------------------------------------------------
  /**
   * Families are built from the pupils' own family names, so a guardian shares
   * a surname with their child. Siblings — pupils in different classes who share
   * a family name — are given the same guardian, which is what makes one
   * guardian answer for two records the way a real intake does.
   */
  const byFamily = new Map<string, typeof enrolments>();

  for (const row of enrolments) {
    byFamily.set(row.last_kh, [...(byFamily.get(row.last_kh) ?? []), row]);
  }

  const households: typeof enrolments[] = [];

  for (const siblings of byFamily.values()) {
    const shuffled = [...siblings].sort(() => random() - 0.5);

    for (let index = 0; index < shuffled.length; ) {
      // About a fifth of households have two children in the school.
      const size = random() < 0.2 && index + 1 < shuffled.length ? 2 : 1;
      households.push(shuffled.slice(index, index + size));
      index += size;
    }
  }

  const passwordHash = await hashPassword(GUARDIAN_PASSWORD);
  let parentSeq = 0;
  let links = 0;
  let secondGuardians = 0;
  let guardianLogins = 0;

  for (const household of households) {
    const [lastKh, lastEn] = [household[0].last_kh, household[0].last_en];
    const guardianCount = random() < 0.35 ? 2 : 1;

    /**
     * A household that registers two guardians registers a father and a mother,
     * one of each. Deciding the second independently — or, as this did, always
     * making it a father — gave 61 children two fathers and nobody two mothers,
     * which is a generator artefact rather than a family.
     */
    const firstIsFather = random() < 0.55;

    for (let index = 0; index < guardianCount; index += 1) {
      parentSeq += 1;

      const isFather = index === 0 ? firstIsFather : !firstIsFather;
      const [firstKh, firstEn] = pick(isFather ? GIVEN_MALE : GIVEN_FEMALE);

      // A minority of guardians ask for a login so they can use the portal.
      let userId: number | null = null;

      if (random() < 0.25) {
        const username = `parent${pad(parentSeq, 4)}`;
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO users (username, email, password_hash, status, email_verified_at)
           VALUES ($1, $2, $3, 'ACTIVE', NOW())
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [username, `${username}@school.local`, passwordHash],
        );

        if (inserted.rows[0]) {
          userId = inserted.rows[0].id;
          guardianLogins += 1;
          await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             SELECT $1, id FROM roles WHERE code = 'PARENT' ON CONFLICT DO NOTHING`,
            [userId],
          );
        }
      }

      const parent = await client.query<{ id: number }>(
        `INSERT INTO parents (user_id, parent_code, first_name_en, last_name_en,
                              first_name_kh, last_name_kh, gender, phone_number,
                              occupation, province, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7::gender, $8, $9, 'Kampong Cham', TRUE)
         RETURNING id`,
        [
          userId,
          `PAR-2025-${pad(parentSeq, 4)}`,
          firstEn, lastEn, firstKh, lastKh,
          isFather ? 'MALE' : 'FEMALE',
          `0${6 + Math.floor(random() * 4)}${pad(Math.floor(random() * 10000000), 7)}`,
          pick(OCCUPATIONS),
        ],
      );

      if (index === 1) {
        secondGuardians += 1;
      }

      for (const child of household) {
        await client.query(
          `INSERT INTO student_parents (student_id, parent_id, relationship,
                                        is_primary_contact, is_emergency_contact, can_pick_up)
           VALUES ($1, $2, $3::guardian_relationship, $4, TRUE, TRUE)
           ON CONFLICT (student_id, parent_id) DO NOTHING`,
          [child.student_id, parent.rows[0].id, isFather ? 'FATHER' : 'MOTHER', index === 0],
        );

        links += 1;
      }
    }
  }

  logger.info(
    `Guardians: ${parentSeq} for ${households.length} household(s), ` +
      `${households.filter((h) => h.length === 2).length} with two children, ` +
      `${secondGuardians} with a second guardian, ${links} links, ${guardianLogins} with a login`,
  );

  // --- The daily register ---------------------------------------------------
  const reasons = (
    await client.query<{ id: number; code: string }>('SELECT id, code FROM attendance_reasons')
  ).rows;
  const reasonFor = (code: string): number | null => reasons.find((r) => r.code === code)?.id ?? null;

  const attendanceRows: unknown[][] = [];

  for (const term of terms) {
    for (const day of schoolDays(term.start_date, term.end_date)) {
      for (const row of enrolments) {
        const roll = random();
        // A real register is mostly present, with a thin tail of everything else.
        const status =
          roll < 0.945 ? 'PRESENT'
          : roll < 0.968 ? 'LATE'
          : roll < 0.986 ? 'ABSENT'
          : roll < 0.995 ? 'EXCUSED'
          : 'LEAVE';

        attendanceRows.push([
          row.student_id, row.class_id, row.enrollment_id, yearId, day, status,
          status === 'LATE' ? 5 + Math.floor(random() * 26) : null,
          status === 'EXCUSED' ? reasonFor('SICK')
          : status === 'LEAVE' ? reasonFor('APPROVED_LEAVE')
          : status === 'ABSENT' ? reasonFor('UNEXCUSED')
          : status === 'LATE' ? reasonFor('TRAFFIC')
          : null,
          admin,
        ]);
      }
    }
  }

  await insertMany(
    client,
    'attendance',
    ['student_id', 'class_id', 'enrollment_id', 'academic_year_id', 'attendance_date',
     'status', 'minutes_late', 'reason_id', 'recorded_by'],
    attendanceRows,
    { 5: 'attendance_status' },
  );

  logger.info(`Register: ${attendanceRows.length} entries across both semesters`);

  /**
   * Summarise the register onto each report card.
   *
   * The cards were written by the roster import, before any register existed, so
   * their attendance columns sat at zero and the screen showed a dash. A term
   * card counts only that term's days; the year-end card counts the whole year.
   */
  const attendanceBackfill = await client.query(
    `UPDATE report_cards rc
        SET days_present  = t.present,
            days_absent   = t.absent,
            days_late     = t.late,
            days_excused  = t.excused,
            attendance_percent = CASE WHEN t.total > 0
              THEN ROUND(100.0 * (t.present + t.late) / t.total, 2) ELSE NULL END
       FROM (
         SELECT rc2.id,
                COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int  AS present,
                COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int   AS absent,
                COUNT(*) FILTER (WHERE a.status = 'LATE')::int     AS late,
                COUNT(*) FILTER (WHERE a.status IN ('EXCUSED', 'LEAVE'))::int AS excused,
                COUNT(*)::int AS total
           FROM report_cards rc2
           LEFT JOIN academic_terms term ON term.id = rc2.term_id
           JOIN attendance a
             ON a.student_id = rc2.student_id
            AND a.academic_year_id = rc2.academic_year_id
            AND (rc2.term_id IS NULL
                 OR a.attendance_date BETWEEN term.start_date AND term.end_date)
          WHERE rc2.academic_year_id = $1
          GROUP BY rc2.id
       ) t
      WHERE rc.id = t.id`,
    [yearId],
  );

  logger.info(`Attendance summarised onto ${attendanceBackfill.rowCount ?? 0} report card(s)`);


  // --- Assessments, calibrated to the real report cards ---------------------
  /**
   * Four pieces of work per subject per term, matching the weighting the school
   * grades with: homework 10, quizzes 20, midterm 30, final 40.
   */
  const PIECES: { type: string; label: string; max: number; at: number }[] = [
    { type: 'HOMEWORK', label: 'Homework', max: 20, at: 0.25 },
    { type: 'QUIZ', label: 'Quiz', max: 20, at: 0.45 },
    { type: 'MIDTERM', label: 'Midterm test', max: 50, at: 0.6 },
    { type: 'FINAL', label: 'Final examination', max: 100, at: 0.92 },
  ];

  const dateWithin = (from: string, to: string, ratio: number): string => {
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();

    return iso(new Date(start + (end - start) * ratio));
  };

  const assessmentRows: unknown[][] = [];
  const assessmentKeys: { classId: number; subjectId: number; termId: number; type: string; max: number; teacherId: number | null }[] = [];

  for (const term of terms) {
    for (const pair of classSubjects) {
      for (const piece of PIECES) {
        assessmentRows.push([
          yearId, term.id, pair.class_id, pair.subject_id, pair.teacher_id,
          `${pair.subject_name} ${piece.label} — ${term.term_order === 1 ? 'S1' : 'S2'}`,
          piece.type, piece.max,
          dateWithin(term.start_date, term.end_date, piece.at),
          true, admin,
        ]);
        assessmentKeys.push({
          classId: pair.class_id, subjectId: pair.subject_id, termId: term.id,
          type: piece.type, max: piece.max, teacherId: pair.teacher_id,
        });
      }
    }
  }

  await insertMany(
    client,
    'assessments',
    ['academic_year_id', 'term_id', 'class_id', 'subject_id', 'teacher_id',
     'title', 'type', 'max_score', 'assessment_date', 'is_published', 'created_by'],
    assessmentRows,
    { 6: 'assessment_type' },
  );

  const assessments = (
    await client.query<{ id: number; class_id: number; subject_id: number; term_id: number; type: string; max_score: string }>(
      `SELECT id, class_id, subject_id, term_id, type::text, max_score
         FROM assessments WHERE academic_year_id = $1`,
      [yearId],
    )
  ).rows;

  /**
   * A pupil's target percentage in one subject.
   *
   * Their real average for the term sets the centre; each subject wobbles around
   * it by a few points, seeded from the pupil and subject so the same pupil is
   * consistently better at the same subjects. Without that, a child would be top
   * of the class in Khmer one term and bottom the next for no reason.
   */
  const subjectIds = [...new Set(classSubjects.map((pair) => pair.subject_id))].sort((a, b) => a - b);

  /**
   * Per-pupil subject offsets that sum to zero.
   *
   * A pupil is better at some subjects than others, so each subject needs an
   * offset — but if those offsets do not cancel, the mean of the subject grades
   * drifts away from the average the report card prints, and a pupil can end up
   * a whole grade band adrift from their own paper. Subtracting the mean pins
   * the average back onto the printed figure while keeping the variation.
   */
  const offsetsFor = new Map<number, Map<number, number>>();

  for (const enrolment of enrolments) {
    const draw = makeRandom(enrolment.student_id * 2654435761);
    const raw = subjectIds.map(() => draw() * 16 - 8);
    const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length;
    offsetsFor.set(
      enrolment.student_id,
      new Map(subjectIds.map((id, index) => [id, raw[index] - mean])),
    );
  }

  const targetFor = (studentId: number, subjectId: number, termId: number | null): number => {
    const base = realAverage.get(`${studentId}:${termId ?? 'year'}`) ?? 60;
    const offset = offsetsFor.get(studentId)?.get(subjectId) ?? 0;

    return Math.max(5, Math.min(100, base + offset));
  };

  const resultRows: unknown[][] = [];

  for (const assessment of assessments) {
    const roster = studentsByClass.get(assessment.class_id) ?? [];
    const max = Number(assessment.max_score);

    for (const pupil of roster) {
      const target = targetFor(pupil.student_id, assessment.subject_id, assessment.term_id);
      // Small, symmetric variation between pieces of work; large enough to look
      // like real marking, small enough not to move the weighted total.
      const noise = random() * 7 - 3.5;
      const percent = Math.max(0, Math.min(100, target + noise));

      resultRows.push([
        assessment.id, pupil.student_id, pupil.enrollment_id,
        Number(((percent / 100) * max).toFixed(2)), false, admin,
      ]);
    }
  }

  await insertMany(
    client,
    'assessment_results',
    ['assessment_id', 'student_id', 'enrollment_id', 'score', 'is_absent', 'graded_by'],
    resultRows,
  );

  logger.info(`Marking: ${assessmentRows.length} assessments, ${resultRows.length} marks`);

  // --- Subject grades, weighted the way the school grades ------------------
  const weights = Object.fromEntries(
    (
      await client.query<{ assessment_type: string; weight_percent: string }>(
        `SELECT c.assessment_type::text, c.weight_percent
           FROM grading_scheme_components c
           JOIN grading_schemes s ON s.id = c.grading_scheme_id AND s.is_default`,
      )
    ).rows.map((row) => [row.assessment_type, Number(row.weight_percent)]),
  );

  const scheme =
    (await client.query<{ id: number }>('SELECT id FROM grading_schemes WHERE is_default LIMIT 1'))
      .rows[0]?.id ?? null;

  const scales = (
    await client.query<{
      letter_grade: string; min_score: string; max_score: string;
      gpa_point: string | null; performance: string;
    }>(
      `SELECT letter_grade, min_score, max_score, gpa_point, performance::text
         FROM grade_scales WHERE grading_scheme_id = $1 ORDER BY min_score DESC`,
      [scheme],
    )
  ).rows;

  const band = (percent: number) =>
    scales.find((s) => percent >= Number(s.min_score) && percent <= Number(s.max_score)) ?? null;

  // Gather earned and possible per pupil, subject, term and assessment type.
  const byAssessment = new Map(assessments.map((a) => [a.id, a]));
  interface Tally { earned: number; possible: number }
  const tallies = new Map<string, Map<string, Tally>>();

  for (const row of resultRows) {
    const [assessmentId, studentId, , score] = row as [number, number, number, number];
    const assessment = byAssessment.get(assessmentId);

    if (!assessment) {
      continue;
    }

    const key = `${studentId}:${assessment.class_id}:${assessment.subject_id}:${assessment.term_id}`;
    const byType = tallies.get(key) ?? new Map<string, Tally>();
    const tally = byType.get(assessment.type) ?? { earned: 0, possible: 0 };
    tally.earned += score;
    tally.possible += Number(assessment.max_score);
    byType.set(assessment.type, tally);
    tallies.set(key, byType);
  }

  interface Computed {
    studentId: number; classId: number; subjectId: number; termId: number;
    percentage: number; enrollmentId: number;
  }

  const enrolmentOf = new Map(enrolments.map((e) => [e.student_id, e.enrollment_id]));
  const computed: Computed[] = [];

  for (const [key, byType] of tallies) {
    const [studentId, classId, subjectId, termId] = key.split(':').map(Number);
    let weighted = 0;
    let used = 0;

    for (const [type, tally] of byType) {
      if (tally.possible <= 0) {
        continue;
      }

      const weight = weights[type] ?? 0;
      weighted += ((tally.earned / tally.possible) * 100 * weight) / 100;
      used += weight;
    }

    if (used <= 0) {
      continue;
    }

    computed.push({
      studentId, classId, subjectId, termId,
      percentage: Number(((weighted / used) * 100).toFixed(2)),
      enrollmentId: enrolmentOf.get(studentId) as number,
    });
  }

  // Rank within the class, per subject and term.
  const rankGroups = new Map<string, Computed[]>();

  for (const row of computed) {
    const key = `${row.classId}:${row.subjectId}:${row.termId}`;
    rankGroups.set(key, [...(rankGroups.get(key) ?? []), row]);
  }

  const rankOf = new Map<string, number>();

  for (const group of rankGroups.values()) {
    [...group]
      .sort((a, b) => b.percentage - a.percentage)
      .forEach((row, index) => {
        rankOf.set(`${row.studentId}:${row.classId}:${row.subjectId}:${row.termId}`, index + 1);
      });
  }

  const gradeRows = computed.map((row) => {
    const scale = band(row.percentage);

    return [
      row.studentId, row.enrollmentId, yearId, row.termId, row.classId, row.subjectId, scheme,
      row.percentage, 100, row.percentage,
      scale?.letter_grade ?? null, scale?.performance ?? null,
      scale?.gpa_point == null ? null : Number(scale.gpa_point),
      rankOf.get(`${row.studentId}:${row.classId}:${row.subjectId}:${row.termId}`) ?? null,
      true, admin,
    ];
  });

  await insertMany(
    client,
    'grades',
    ['student_id', 'enrollment_id', 'academic_year_id', 'term_id', 'class_id', 'subject_id',
      'grading_scheme_id', 'score', 'max_score', 'percentage', 'letter_grade', 'performance',
      'gpa_point', 'rank_in_class', 'is_final', 'recorded_by'],
    gradeRows,
    { 11: 'performance_level' },
  );

  logger.info(`Grades: ${gradeRows.length} subject grades calculated from those marks`);

  // --- The per-subject lines on each report card ---------------------------
  /**
   * The report cards already carry the overall average from the printed sheets.
   * What they lacked was the breakdown, so each card now lists the subject
   * grades that sit behind its total.
   */
  const cards = (
    await client.query<{ id: number; student_id: number; term_id: number | null }>(
      `SELECT id, student_id, term_id FROM report_cards WHERE academic_year_id = $1`,
      [yearId],
    )
  ).rows;

  const storedGrades = (
    await client.query<{
      id: number; student_id: number; subject_id: number; term_id: number;
      percentage: string; letter_grade: string | null; performance: string | null;
      rank_in_class: number | null;
    }>(
      `SELECT id, student_id, subject_id, term_id, percentage, letter_grade,
              performance::text, rank_in_class
         FROM grades WHERE academic_year_id = $1`,
      [yearId],
    )
  ).rows;

  const gradeIndex = new Map<string, typeof storedGrades>();

  for (const grade of storedGrades) {
    const key = `${grade.student_id}:${grade.term_id}`;
    gradeIndex.set(key, [...(gradeIndex.get(key) ?? []), grade]);
  }

  const subjectOrder = new Map(
    (
      await client.query<{ id: number; code: string }>(
        'SELECT id, code FROM subjects WHERE deleted_at IS NULL ORDER BY code',
      )
    ).rows.map((row, index) => [row.id, index] as [number, number]),
  );

  const lastTermId = terms[terms.length - 1]?.id;
  const cardSubjectRows: unknown[][] = [];

  for (const card of cards) {
    // A year-end card summarises the year, so it shows the final semester's
    // subject grades rather than repeating both.
    const termKey = card.term_id ?? lastTermId;

    for (const grade of gradeIndex.get(`${card.student_id}:${termKey}`) ?? []) {
      cardSubjectRows.push([
        card.id, grade.subject_id, grade.id,
        Number(grade.percentage), 100, Number(grade.percentage),
        grade.letter_grade, grade.performance, grade.rank_in_class,
        subjectOrder.get(grade.subject_id) ?? 99,
      ]);
    }
  }

  await insertMany(
    client,
    'report_card_subjects',
    ['report_card_id', 'subject_id', 'grade_id', 'score', 'max_score', 'percentage',
      'letter_grade', 'performance', 'rank_in_class', 'display_order'],
    cardSubjectRows,
    { 7: 'performance_level' },
  );

  logger.info(`Report cards: ${cardSubjectRows.length} subject lines across ${cards.length} cards`);

  // --- Homework -------------------------------------------------------------
  /**
   * Two pieces of homework per subject per term. The first is tied to the
   * HOMEWORK assessment so the mark a teacher gives on the homework page is the
   * same mark that feeds the grade, rather than a second, unrelated number.
   */
  const homeworkAssessment = new Map<string, number>();

  for (const assessment of assessments) {
    if (assessment.type === 'HOMEWORK') {
      homeworkAssessment.set(
        `${assessment.class_id}:${assessment.subject_id}:${assessment.term_id}`,
        assessment.id,
      );
    }
  }

  const TASKS = [
    { label: 'Exercise book', at: 0.2, days: 7 },
    { label: 'Practice worksheet', at: 0.7, days: 5 },
  ];

  const assignmentRows: unknown[][] = [];
  const assignmentKeys: { classId: number; subjectId: number; termId: number; max: number; linked: boolean }[] = [];

  for (const term of terms) {
    for (const pair of classSubjects) {
      for (const [index, task] of TASKS.entries()) {
        const assigned = dateWithin(term.start_date, term.end_date, task.at);
        const due = iso(addDays(new Date(`${assigned}T00:00:00Z`), task.days));
        const linkedId = index === 0
          ? homeworkAssessment.get(`${pair.class_id}:${pair.subject_id}:${term.id}`) ?? null
          : null;

        assignmentRows.push([
          yearId, term.id, pair.class_id, pair.subject_id, pair.teacher_id, linkedId,
          `${pair.subject_name} — ${task.label}`,
          `${task.label} for ${pair.subject_name}.`,
          assigned, due, 20, 'CLOSED', admin,
        ]);
        assignmentKeys.push({
          classId: pair.class_id, subjectId: pair.subject_id, termId: term.id,
          max: 20, linked: linkedId !== null,
        });
      }
    }
  }

  await insertMany(
    client,
    'assignments',
    ['academic_year_id', 'term_id', 'class_id', 'subject_id', 'teacher_id', 'assessment_id',
      'title', 'description', 'assigned_date', 'due_date', 'max_score', 'status', 'created_by'],
    assignmentRows,
    { 11: 'assignment_status' },
  );

  const assignmentIds = (
    await client.query<{ id: number; class_id: number; subject_id: number; term_id: number; max_score: string }>(
      `SELECT id, class_id, subject_id, term_id, max_score FROM assignments
        WHERE academic_year_id = $1 ORDER BY id`,
      [yearId],
    )
  ).rows;

  const submissionRows: unknown[][] = [];

  for (const assignment of assignmentIds) {
    const roster = studentsByClass.get(assignment.class_id) ?? [];
    const max = Number(assignment.max_score);

    for (const pupil of roster) {
      const roll = random();

      // A realistic hand-in pattern: most on time, a few late, a few never.
      if (roll > 0.94) {
        submissionRows.push([assignment.id, pupil.student_id, 'MISSING', null, null, null, null]);
        continue;
      }

      const late = roll > 0.86;
      const target = targetFor(pupil.student_id, assignment.subject_id, assignment.term_id);
      const score = Number((((target + random() * 8 - 4) / 100) * max).toFixed(2));

      submissionRows.push([
        assignment.id, pupil.student_id, 'GRADED',
        'Submitted through the student portal.',
        new Date(),
        Math.max(0, Math.min(max, score)),
        late ? 'Handed in after the due date.' : 'Good work.',
      ]);
    }
  }

  await insertMany(
    client,
    'submissions',
    ['assignment_id', 'student_id', 'status', 'content', 'submitted_at', 'score', 'feedback'],
    submissionRows,
    { 2: 'submission_status' },
  );

  logger.info(`Homework: ${assignmentRows.length} assignments, ${submissionRows.length} submissions`);

  // --- School examinations --------------------------------------------------
  /**
   * The midterm and the final are sittings as well as marks. The exam row is the
   * sitting; the score copied onto it is the one already recorded against the
   * matching assessment, so the two never disagree.
   */
  const scoreByAssessment = new Map<number, Map<number, number>>();

  for (const row of resultRows) {
    const [assessmentId, studentId, , score] = row as [number, number, number, number];
    const forAssessment = scoreByAssessment.get(assessmentId) ?? new Map<number, number>();
    forAssessment.set(studentId, score);
    scoreByAssessment.set(assessmentId, forAssessment);
  }

  const examSources = assessments.filter((a) => a.type === 'MIDTERM' || a.type === 'FINAL');
  const roomOf = new Map(classes.map((c) => [c.id, c.room_id]));
  const subjectNameOf = new Map(classSubjects.map((p) => [p.subject_id, p.subject_name]));
  const termOrderOf = new Map(terms.map((t) => [t.id, t.term_order]));

  const examRows: unknown[][] = [];

  for (const source of examSources) {
    const term = terms.find((t) => t.id === source.term_id);

    if (!term) {
      continue;
    }

    examRows.push([
      yearId, source.term_id, source.class_id, source.subject_id, roomOf.get(source.class_id) ?? null,
      `${subjectNameOf.get(source.subject_id) ?? 'Subject'} ${source.type === 'MIDTERM' ? 'midterm' : 'final'} — S${termOrderOf.get(source.term_id) ?? 1}`,
      source.type, dateWithin(term.start_date, term.end_date, source.type === 'MIDTERM' ? 0.6 : 0.92),
      '08:00', source.type === 'MIDTERM' ? 60 : 120, Number(source.max_score), admin,
    ]);
  }

  await insertMany(
    client,
    'exams',
    ['academic_year_id', 'term_id', 'class_id', 'subject_id', 'room_id', 'title', 'type',
      'exam_date', 'start_time', 'duration_minutes', 'max_score', 'created_by'],
    examRows,
    { 6: 'exam_type', 8: 'time' },
  );

  const examIds = (
    await client.query<{ id: number; class_id: number; subject_id: number; term_id: number; type: string }>(
      `SELECT id, class_id, subject_id, term_id, type::text FROM exams
        WHERE academic_year_id = $1`,
      [yearId],
    )
  ).rows;

  const assessmentByKey = new Map(
    assessments.map((a) => [`${a.class_id}:${a.subject_id}:${a.term_id}:${a.type}`, a.id]),
  );

  const examResultRows: unknown[][] = [];

  for (const exam of examIds) {
    const sourceId = assessmentByKey.get(
      `${exam.class_id}:${exam.subject_id}:${exam.term_id}:${exam.type}`,
    );
    const scores = sourceId ? scoreByAssessment.get(sourceId) : undefined;

    if (!scores) {
      continue;
    }

    for (const [studentId, score] of scores) {
      examResultRows.push([exam.id, studentId, score, false, admin, new Date()]);
    }
  }

  await insertMany(
    client,
    'exam_results',
    ['exam_id', 'student_id', 'score', 'is_absent', 'graded_by', 'graded_at'],
    examResultRows,
  );

  logger.info(`Examinations: ${examRows.length} sittings, ${examResultRows.length} results`);

  // --- Behaviour and homeroom remarks --------------------------------------
  const POSITIVE = [
    ['ACHIEVEMENT', 'Top of the class this month', 3],
    ['POSITIVE', 'Helped a classmate catch up', 2],
    ['PARTICIPATION', 'Answered well throughout the lesson', 1],
    ['TEAMWORK', 'Worked well in the group task', 2],
    ['RESPONSIBILITY', 'Looked after the classroom', 2],
  ] as const;

  const NEGATIVE = [
    ['WARNING', 'Homework not handed in twice', -2],
    ['DISCIPLINARY', 'Disrupted the lesson', -3],
  ] as const;

  const behaviourRows: unknown[][] = [];
  const teacherOf = new Map(classes.map((c) => [c.id, c.homeroom_teacher_id]));

  for (const pupil of enrolments) {
    const count = Math.floor(random() * 3);

    for (let index = 0; index < count; index += 1) {
      const good = random() < 0.78;
      const [type, title, points] = good ? pick([...POSITIVE]) : pick([...NEGATIVE]);
      const term = pick(terms);

      behaviourRows.push([
        pupil.student_id, yearId, pupil.class_id, teacherOf.get(pupil.class_id) ?? null,
        type, title, dateWithin(term.start_date, term.end_date, random()), points, true, admin,
      ]);
    }
  }

  await insertMany(
    client,
    'student_behaviors',
    ['student_id', 'academic_year_id', 'class_id', 'teacher_id', 'type', 'title',
      'occurred_on', 'points', 'visible_to_parent', 'recorded_by'],
    behaviourRows,
    { 4: 'behavior_type' },
  );

  const REMARKS = [
    'Works steadily and takes correction well.',
    'A capable pupil who should speak up more in class.',
    'Attendance is good; homework is sometimes late.',
    'Has improved a great deal this semester.',
    'Needs to spend more time on written work at home.',
    'A pleasure to teach and helpful to classmates.',
  ];

  const commentRows: unknown[][] = [];

  for (const pupil of enrolments) {
    for (const term of terms) {
      commentRows.push([
        pupil.student_id, yearId, term.id, pupil.class_id,
        teacherOf.get(pupil.class_id) ?? null, true, pick(REMARKS), true, admin,
      ]);
    }
  }

  await insertMany(
    client,
    'student_comments',
    ['student_id', 'academic_year_id', 'term_id', 'class_id', 'teacher_id',
      'is_homeroom', 'comment', 'visible_to_parent', 'created_by'],
    commentRows,
  );

  logger.info(`Development: ${behaviourRows.length} behaviour notes, ${commentRows.length} homeroom remarks`);

  // --- Announcements and notifications -------------------------------------
  const NOTICES: { title: string; body: string; audience: string; pinned?: boolean }[] = [
    { title: 'Academic year 2025-2026 begins', body: 'Classes start on Monday 3 November. Pupils should arrive by 06:45 in full uniform.', audience: 'ALL', pinned: true },
    { title: 'Parent meeting — first semester', body: 'Guardians are invited to meet homeroom teachers on Saturday morning. Report cards will be handed out.', audience: 'PARENTS' },
    { title: 'Midterm examination timetable', body: 'The midterm sittings run over four days. The timetable is posted outside each classroom.', audience: 'STUDENTS' },
    { title: 'Teachers meeting — grade entry', body: 'All subject teachers must enter their marks before the end of the week so report cards can be produced.', audience: 'TEACHERS' },
    { title: 'Water and hygiene', body: 'Pupils should bring their own drinking bottle. The new hand-washing points are in use behind the main building.', audience: 'ALL' },
    { title: 'Grade 9 examination briefing', body: 'Grade 9 pupils and their guardians should attend the briefing about the coming year.', audience: 'GRADE' },
    { title: 'Second semester begins', body: 'The second semester starts on 30 March. Timetables are unchanged.', audience: 'ALL', pinned: true },
    { title: 'Khmer New Year holiday', body: 'The school will be closed for the New Year holiday. Lessons resume the following Monday.', audience: 'ALL' },
    { title: 'Final examination arrangements', body: 'Final sittings begin in the last week of July. Pupils must bring their own pens.', audience: 'STUDENTS' },
    { title: 'Report cards and results day', body: 'Results for the year will be issued on 3 August. Guardians are welcome to collect them in person.', audience: 'PARENTS', pinned: true },
    { title: 'Library books to be returned', body: 'All borrowed books must be returned before the end of term.', audience: 'STUDENTS' },
    { title: 'Sports afternoon', body: 'The inter-class sports afternoon takes place on the last Friday of the month.', audience: 'ALL' },
  ];

  const grade9 = (
    await client.query<{ id: number }>(
      `SELECT id FROM grade_levels WHERE is_exit_grade LIMIT 1`,
    )
  ).rows[0]?.id ?? null;

  const announcementRows = NOTICES.map((notice, index) => [
    notice.title, notice.body, notice.audience,
    notice.audience === 'GRADE' ? grade9 : null,
    yearId, 'PUBLISHED', notice.pinned ?? false,
    dateWithin(year.start_date.slice(0, 10), year.end_date.slice(0, 10), (index + 1) / (NOTICES.length + 1)),
    admin, admin,
  ]);

  await insertMany(
    client,
    'announcements',
    ['title', 'body', 'audience', 'grade_level_id', 'academic_year_id', 'status',
      'is_pinned', 'published_at', 'created_by', 'published_by'],
    announcementRows,
    { 2: 'announcement_audience', 5: 'announcement_status', 7: 'timestamptz' },
  );

  // Notifications go to the people who actually hold a login.
  const recipients = (
    await client.query<{ id: number; role: string }>(
      `SELECT DISTINCT u.id, r.code AS role
         FROM users u JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE u.deleted_at IS NULL AND r.code IN ('TEACHER', 'HOMEROOM_TEACHER', 'PARENT', 'STUDENT')`,
    )
  ).rows;

  const published = (
    await client.query<{ id: number; title: string; audience: string }>(
      `SELECT id, title, audience::text FROM announcements WHERE academic_year_id = $1 ORDER BY id`,
      [yearId],
    )
  ).rows;

  let notificationCount = 0;
  const recipientRows: unknown[][] = [];

  for (const announcement of published) {
    const notification = await client.query<{ id: number }>(
      `INSERT INTO notifications (type, title, body, entity_type, entity_id, created_by)
       VALUES ('ANNOUNCEMENT'::notification_type, $1, $2, 'announcement', $3, $4)
       RETURNING id`,
      [announcement.title, 'A new announcement has been published.', announcement.id, admin],
    );

    notificationCount += 1;

    const audience = recipients.filter((person) =>
      announcement.audience === 'ALL' ? true
      : announcement.audience === 'PARENTS' ? person.role === 'PARENT'
      : announcement.audience === 'STUDENTS' ? person.role === 'STUDENT'
      : announcement.audience === 'TEACHERS' ? person.role.endsWith('TEACHER')
      : true,
    );

    for (const person of audience) {
      recipientRows.push([
        notification.rows[0].id, person.id, random() < 0.6 ? new Date() : null,
      ]);
    }
  }

  await insertMany(
    client,
    'notification_recipients',
    ['notification_id', 'user_id', 'read_at'],
    recipientRows,
  );

  logger.info(
    `Communication: ${announcementRows.length} announcements, ${notificationCount} notifications, ` +
      `${recipientRows.length} deliveries`,
  );

  logger.info('School life seeded');
};
