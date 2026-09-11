import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { seedStaff } from './006_school_population.seed';

/**
 * The school's real roster for 2025-2026, transcribed from the Student
 * Achievement sheets signed on 3 August 2026.
 *
 * Five classes — 7A, 7B, 7C, 8A and 8B — carry real children with the marks
 * their teachers awarded. Every count in this file was reconciled against the
 * summary box printed at the foot of each sheet before it was written: totals,
 * female counts, and the number of students in each grade band all match.
 *
 * The school does not run only five classes, so 8C, 9A and 9B are filled with
 * generated pupils. Their names are checked against every real name and against
 * each other, so no generated child ever shares a name with a real one.
 *
 * Marks are out of 50 and stored exactly as printed. The printed average is
 * authoritative: it cannot always be recovered from the two printed semester
 * marks, because those are themselves rounded and the school averaged the
 * underlying values.
 */

interface RosterFile {
  scale: { max: number; veryGood: number; good: number; average: number };
  classes: {
    code: string;
    grade: string;
    homeroom: { kh: string; en: string } | null;
    students: [string, string, string, string, string, number | null, number | null, number, number | null, boolean?][];
  }[];
}

const roster: RosterFile = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'roster-2025-2026.json'), 'utf8'),
);

export const YEAR_NAME = '2025 - 2026';
const YEAR_START = '2025-11-03';
const YEAR_END = '2026-08-03';
const TERM_1_END = '2026-03-27';
const TERM_2_START = '2026-03-30';

/** Classes the sheets do not cover, filled with generated pupils. */
const GENERATED_CLASSES = [
  { code: '8C', grade: 'G8', size: 45 },
  { code: '9A', grade: 'G9', size: 43 },
  { code: '9B', grade: 'G9', size: 41 },
];

/** Deterministic PRNG, so a re-run produces the same generated pupils. */
const makeRandom = (seed: number) => {
  let state = seed >>> 0;

  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const FAMILY: [string, string][] = [
  ['សុខ', 'Sok'], ['ចាន់', 'Chan'], ['មាស', 'Meas'], ['លី', 'Ly'], ['នូវ', 'Nov'],
  ['ជា', 'Chea'], ['គីម', 'Kim'], ['ហេង', 'Heng'], ['ពេជ្រ', 'Pich'], ['សំ', 'Sam'],
  ['ឡុង', 'Long'], ['យីម', 'Yim'], ['ទេព', 'Tep'], ['អ៊ុច', 'Uch'], ['ឃុន', 'Khun'],
  ['រស់', 'Ros'], ['ហោ', 'Hor'], ['សេង', 'Seng'], ['វង្ស', 'Vong'], ['ឈីម', 'Chhim'],
  ['ញ៉ែម', 'Nhem'], ['ប្រាក់', 'Prak'], ['ទួច', 'Touch'], ['អៀម', 'Eam'], ['ម៉ៅ', 'Mao'],
  ['ខៀវ', 'Khiev'], ['ធន់', 'Thon'], ['ស៊ន', 'Son'], ['ប៉ែន', 'Pen'], ['អ៊ាង', 'Eang'],
];

const GIVEN_MALE: [string, string][] = [
  ['តារា', 'Dara'], ['សុខា', 'Sokha'], ['វិជ្ជា', 'Vichea'], ['រិទ្ធី', 'Rithy'],
  ['ពិសិដ្ឋ', 'Piseth'], ['ចន្ថូ', 'Chanthou'], ['សំណាង', 'Samnang'], ['វាសនា', 'Veasna'],
  ['សុវណ្ណ', 'Sovann'], ['គីមសាន', 'Kimsan'], ['រតនា', 'Ratana'], ['ប៊ុនធឿន', 'Bunthoeun'],
  ['ចន្រា', 'Chanra'], ['សុភ័ក្ត', 'Sopheak'], ['វុទ្ធី', 'Vuthy'], ['បញ្ញា', 'Panha'],
  ['សិរីវុទ្ធ', 'Sereivuth'], ['កុសល', 'Kosal'], ['នរៈ', 'Naret'], ['ភិរុណ', 'Phirun'],
  ['ដារ៉ូត', 'Darot'], ['សុផល', 'Sophal'], ['ចន្ធា', 'Chantha'], ['រ៉ាវី', 'Ravy'],
];

const GIVEN_FEMALE: [string, string][] = [
  ['ស្រីមុំ', 'Sreymom'], ['បុប្ផា', 'Bopha'], ['ពិសី', 'Pisey'], ['ស្រីនាង', 'Sreyneang'],
  ['ចន្នារី', 'Channary'], ['សុគន្ធា', 'Sokunthea'], ['ដាវី', 'Davy'], ['ចិន្តា', 'Chenda'],
  ['ម៉ាលី', 'Maly'], ['សិត្រា', 'Sithra'], ['ធារី', 'Theary'], ['វណ្ណា', 'Vanna'],
  ['នារី', 'Nary'], ['សុភាព', 'Sopheap'], ['គន្ធា', 'Kunthea'], ['ស្រីពៅ', 'Sreypov'],
  ['ចន្លីណា', 'Chanlina'], ['មុលិកា', 'Molika'], ['រស្មី', 'Raksmey'], ['សុជាតា', 'Sochata'],
  ['នីរ៉ា', 'Nira'], ['ធីតា', 'Thida'], ['សំអាត', 'Samat'], ['ចន្ទ្រា', 'Chantrea'],
];

/** The band a printed average falls into, using the school's own cut-offs. */
export const bandFor = (
  average: number,
  scale: RosterFile['scale'],
): { letter: string; performance: string; label: string; pass: boolean; gpa: number } => {
  if (average >= scale.veryGood) {
    return { letter: 'A', performance: 'EXCELLENT', label: 'Very Good', pass: true, gpa: 4 };
  }

  if (average >= scale.good) {
    return { letter: 'B', performance: 'GOOD', label: 'Good', pass: true, gpa: 3 };
  }

  if (average >= scale.average) {
    return { letter: 'C', performance: 'FAIR', label: 'Average', pass: true, gpa: 2 };
  }

  return { letter: 'F', performance: 'NEEDS_IMPROVEMENT', label: 'Poor', pass: false, gpa: 0 };
};

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

export const seedRealRoster = async (client: PoolClient): Promise<void> => {
  const random = makeRandom(20252026);
  const scale = roster.scale;

  // --- The year the sheets belong to ---------------------------------------
  // Only one year may be current, and the schema enforces it with a partial
  // unique index, so every other year stands down before this one is created.
  await client.query(
    `UPDATE academic_years SET is_active = FALSE, status = 'UPCOMING' WHERE is_active`,
  );

  const yearRow = await client.query<{ id: number }>(
    `INSERT INTO academic_years (name, start_date, end_date, status, is_active)
     VALUES ($1, $2, $3, 'ACTIVE', TRUE)
     ON CONFLICT (name) DO UPDATE
       SET start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date,
           status = 'ACTIVE',
           is_active = TRUE
     RETURNING id`,
    [YEAR_NAME, YEAR_START, YEAR_END],
  );

  const yearId = yearRow.rows[0].id;

  await client.query(
    `INSERT INTO academic_terms (academic_year_id, name, term_order, start_date, end_date, is_active)
     VALUES ($1, 'Semester 1', 1, $2, $3, FALSE),
            ($1, 'Semester 2', 2, $4, $5, TRUE)
     ON CONFLICT (academic_year_id, term_order) DO UPDATE
       SET name = EXCLUDED.name,
           start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date,
           is_active = EXCLUDED.is_active`,
    [yearId, YEAR_START, TERM_1_END, TERM_2_START, YEAR_END],
  );

  const terms = await client.query<{ id: number; term_order: number }>(
    'SELECT id, term_order FROM academic_terms WHERE academic_year_id = $1 ORDER BY term_order',
    [yearId],
  );

  const termId = new Map(terms.rows.map((row) => [row.term_order, row.id]));

  /**
   * A clean slate for this year, so the import can be re-run after a correction
   * to a name or a mark.
   *
   * The pupils go too, not just their enrolments: they are identified only by a
   * generated code, so leaving them behind would both collide on that code and
   * strand children in a year they are no longer enrolled in. Order matters —
   * `enrollments.student_id` is ON DELETE RESTRICT, so the enrolment has to go
   * before the pupil it points at.
   */
  const previous = await client.query<{ student_id: number }>(
    'SELECT DISTINCT student_id FROM enrollments WHERE academic_year_id = $1',
    [yearId],
  );

  const previousIds = previous.rows.map((row) => row.student_id);

  /**
   * Everything that hangs off those pupils has to go first.
   *
   * `attendance.student_id` and several others are ON DELETE RESTRICT — the
   * database refuses to remove a pupil whose register still exists, which is
   * exactly the protection the school wants. It also means this import cannot
   * simply drop the pupils once a year of school life has been generated on top
   * of them, so the dependants are cleared here in child-to-parent order.
   */
  if (previousIds.length) {
    for (const sql of [
      `DELETE FROM notification_recipients WHERE user_id IN
         (SELECT user_id FROM students WHERE id = ANY($1::bigint[]) AND user_id IS NOT NULL)`,
      `DELETE FROM submissions WHERE student_id = ANY($1::bigint[])`,
      `DELETE FROM exam_results WHERE student_id = ANY($1::bigint[])`,
      `DELETE FROM assessment_results WHERE student_id = ANY($1::bigint[])`,
      `DELETE FROM grade_history WHERE grade_id IN
         (SELECT id FROM grades WHERE student_id = ANY($1::bigint[]))`,
      `DELETE FROM grades WHERE student_id = ANY($1::bigint[])`,
      `DELETE FROM student_behaviors WHERE student_id = ANY($1::bigint[])`,
      `DELETE FROM student_comments WHERE student_id = ANY($1::bigint[])`,
      `DELETE FROM attendance WHERE student_id = ANY($1::bigint[])`,
      `DELETE FROM student_parents WHERE student_id = ANY($1::bigint[])`,
    ]) {
      await client.query(sql, [previousIds]);
    }
  }

  await client.query(
    `DELETE FROM report_card_subjects WHERE report_card_id IN
       (SELECT id FROM report_cards WHERE academic_year_id = $1)`,
    [yearId],
  );
  await client.query('DELETE FROM report_cards WHERE academic_year_id = $1', [yearId]);
  await client.query('DELETE FROM enrollments WHERE academic_year_id = $1', [yearId]);

  if (previousIds.length) {
    const removed = await client.query(
      `DELETE FROM students s
        WHERE s.id = ANY($1::bigint[])
          AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id)
        RETURNING s.id`,
      [previousIds],
    );

    logger.info(`Cleared ${removed.rowCount ?? 0} pupil(s) from a previous import of ${YEAR_NAME}`);
  }

  // --- Classes --------------------------------------------------------------
  // The sheets name three homeroom teachers, so the staff have to exist first.
  await seedStaff(client, { yearLabel: YEAR_NAME, startDate: YEAR_START });

  const teachers = await client.query<{ id: number; name: string }>(
    `SELECT id, TRIM(CONCAT(first_name_en, ' ', last_name_en)) AS name
       FROM teachers WHERE deleted_at IS NULL ORDER BY id`,
  );

  const findTeacher = (english: string): number | null => {
    const [family, given] = english.split(' ');
    const match = teachers.rows.find(
      (row) => row.name.includes(given) && row.name.includes(family),
    );

    return match?.id ?? null;
  };

  const plan = [
    ...roster.classes.map((entry) => ({ code: entry.code, grade: entry.grade, homeroom: entry.homeroom })),
    ...GENERATED_CLASSES.map((entry) => ({ code: entry.code, grade: entry.grade, homeroom: null })),
  ];

  const classId = new Map<string, number>();

  for (const [index, entry] of plan.entries()) {
    // The sheets name the homeroom teacher for 7A, 7B and 7C; the rest are
    // spread over the remaining staff.
    const homeroomId =
      (entry.homeroom ? findTeacher(entry.homeroom.en) : null) ??
      teachers.rows[index % teachers.rows.length]?.id ??
      null;

    const existing = await client.query<{ id: number }>(
      `SELECT id FROM classes
        WHERE academic_year_id = $1 AND LOWER(code) = LOWER($2) AND deleted_at IS NULL`,
      [yearId, entry.code],
    );

    const row = existing.rows[0]
      ? await client.query<{ id: number }>(
          `UPDATE classes SET homeroom_teacher_id = $2, is_active = TRUE WHERE id = $1 RETURNING id`,
          [existing.rows[0].id, homeroomId],
        )
      : await client.query<{ id: number }>(
          `INSERT INTO classes (academic_year_id, grade_level_id, homeroom_teacher_id, room_id,
                                code, name, capacity, is_active)
           SELECT $1,
                  (SELECT id FROM grade_levels WHERE code = $2),
                  $3,
                  (SELECT id FROM rooms WHERE code = $4),
                  $4, $5, 50, TRUE
        RETURNING id`,
          [yearId, entry.grade, homeroomId, entry.code, `Grade ${entry.code}`],
        );

    classId.set(entry.code, row.rows[0].id);

    if (homeroomId) {
      await client.query(
        `INSERT INTO teacher_classes (teacher_id, class_id, is_homeroom)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (teacher_id, class_id) DO UPDATE SET is_homeroom = TRUE`,
        [homeroomId, row.rows[0].id],
      );
    }
  }

  // --- Every name already spoken for ---------------------------------------
  const takenNames = new Set<string>();

  for (const cls of roster.classes) {
    for (const student of cls.students) {
      takenNames.add(`${student[0]} ${student[1]}`);
    }
  }

  // --- Writing one pupil ----------------------------------------------------
  let sequence = 0;

  const writeStudent = async (
    code: string,
    input: {
      lastKh: string; firstKh: string; lastEn: string; firstEn: string;
      gender: string; roll: number; grade: string; classSize: number;
      sem1: number | null; sem2: number | null; average: number; rank: number | null;
    },
  ): Promise<void> => {
    sequence += 1;

    const birthYear = input.grade === 'G7' ? 2013 : input.grade === 'G8' ? 2012 : 2011;
    const student = await client.query<{ id: number }>(
      `INSERT INTO students (student_code, first_name_en, last_name_en, first_name_kh,
                             last_name_kh, gender, date_of_birth, enrolled_date, status)
       VALUES ($1, $2, $3, $4, $5, $6::gender, $7, $8, 'ACTIVE')
       RETURNING id`,
      [
        `STU-2025-${pad(sequence, 4)}`,
        input.firstEn, input.lastEn, input.firstKh, input.lastKh,
        input.gender,
        `${birthYear}-${pad(1 + Math.floor(random() * 12), 2)}-${pad(1 + Math.floor(random() * 28), 2)}`,
        YEAR_START,
      ],
    );

    const studentId = student.rows[0].id;
    const enrollment = await client.query<{ id: number }>(
      `INSERT INTO enrollments (student_id, academic_year_id, class_id, roll_number,
                                enrolled_date, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING id`,
      [studentId, yearId, classId.get(code), pad(input.roll, 2), YEAR_START],
    );

    const enrollmentId = enrollment.rows[0].id;

    /**
     * Three report cards: one per semester, then the year-end card.
     *
     * The Grade and Rank columns on the sheet describe the *year average*, not
     * either semester, so they belong on the year-end card alone. A semester
     * card carries only that semester's mark and the band it falls into; giving
     * it the year's rank would state something the paper never says.
     */
    const cards: { term: number | null; mark: number; rank: number | null }[] = [];

    if (input.sem1 !== null) {
      cards.push({ term: termId.get(1) ?? null, mark: input.sem1, rank: null });
    }

    if (input.sem2 !== null) {
      cards.push({ term: termId.get(2) ?? null, mark: input.sem2, rank: null });
    }

    // The year-end card, with term_id NULL, is the row that reproduces the sheet.
    cards.push({ term: null, mark: input.average, rank: input.rank });

    for (const card of cards) {
      /**
       * One pupil on the 8A sheet has an average but no rank, and their Grade
       * and Result cells are left blank. The mark is recorded; the band is not,
       * because the school did not award one.
       */
      const unranked = card.term === null && input.rank === null;
      const band = unranked ? null : bandFor(card.mark, scale);
      /**
       * Two scales, deliberately kept apart.
       *
       * The sheets mark out of 50, and that printed figure is what the school
       * and its families recognise, so it is preserved verbatim in
       * `total_score`. Everything else in this system — `grades.percentage`,
       * the grade scale, the report card screen — works in percent, so
       * `average_score` carries the same mark doubled. Storing the 50-scale
       * value there made the report card read "46.4%" for a pupil who had in
       * fact scored 92.9%.
       */
      await client.query(
        `INSERT INTO report_cards (student_id, enrollment_id, academic_year_id, term_id, class_id,
                                   total_score, average_score, gpa, letter_grade, performance,
                                   rank_in_class, class_size, status, generated_at, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::performance_level, $11, $12,
                 'PUBLISHED', NOW(), NOW())`,
        [
          studentId, enrollmentId, yearId, card.term, classId.get(code),
          card.mark,
          Number(((card.mark / scale.max) * 100).toFixed(2)),
          band?.gpa ?? null,
          band?.letter ?? null, band?.performance ?? null,
          card.rank, input.classSize,
        ],
      );
    }
  };

  // --- The real classes -----------------------------------------------------
  for (const cls of roster.classes) {
    for (const [index, entry] of cls.students.entries()) {
      const [lastKh, firstKh, lastEn, firstEn, gender, sem1, sem2, average, rank] = entry;
      await writeStudent(cls.code, {
        lastKh, firstKh, lastEn, firstEn, gender,
        roll: index + 1, grade: cls.grade, classSize: cls.students.length,
        sem1, sem2, average, rank,
      });
    }

    logger.info(`Imported ${cls.students.length} student(s) into ${cls.code} from the sheet`);
  }

  // --- The classes the sheets do not cover ---------------------------------
  for (const entry of GENERATED_CLASSES) {
    const generated: { lastKh: string; firstKh: string; lastEn: string; firstEn: string; gender: string; average: number; sem1: number; sem2: number }[] = [];

    while (generated.length < entry.size) {
      const isMale = random() < 0.5;
      const [firstKh, firstEn] = (isMale ? GIVEN_MALE : GIVEN_FEMALE)[
        Math.floor(random() * (isMale ? GIVEN_MALE : GIVEN_FEMALE).length)
      ];
      const [lastKh, lastEn] = FAMILY[Math.floor(random() * FAMILY.length)];
      const full = `${lastKh} ${firstKh}`;

      // No generated child may share a name with a real one, or with another
      // generated one.
      if (takenNames.has(full)) {
        continue;
      }

      takenNames.add(full);

      // Marks shaped like the real classes: most pass, a handful do not.
      const sem1 = Number((14 + random() * 32).toFixed(2));
      const sem2 = Number(Math.min(50, Math.max(5, sem1 + (random() - 0.45) * 8)).toFixed(2));
      const average = Number(((sem1 + sem2) / 2).toFixed(2));

      generated.push({ lastKh, firstKh, lastEn, firstEn, gender: isMale ? 'MALE' : 'FEMALE', sem1, sem2, average });
    }

    generated.sort((a, b) => b.average - a.average);

    for (const [index, person] of generated.entries()) {
      await writeStudent(entry.code, {
        ...person,
        roll: index + 1,
        grade: entry.grade,
        classSize: generated.length,
        rank: index + 1,
      });
    }

    logger.info(`Generated ${entry.size} student(s) for ${entry.code}, no name repeated`);
  }

  const total = roster.classes.reduce((sum, cls) => sum + cls.students.length, 0);
  const made = GENERATED_CLASSES.reduce((sum, cls) => sum + cls.size, 0);

  logger.info(
    `Roster for ${YEAR_NAME}: ${total} real student(s) from the sheets, ${made} generated, ` +
      `${total + made} in ${plan.length} classes`,
  );
};
