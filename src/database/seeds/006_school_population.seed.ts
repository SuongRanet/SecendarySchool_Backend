import type { PoolClient } from 'pg';
import { hashPassword } from '../../utils/password';
import { logger } from '../../utils/logger';

/**
 * A full year group for Hun Sen Turi Secondary School: eleven classes, the
 * teachers to staff them, 267 students and the families behind them.
 *
 * The numbers are not arbitrary. Teaching load drives the staff count, and the
 * family structure mirrors a real intake, where a sizeable minority of students
 * have a brother or sister in the same school and a guardian therefore appears
 * against two records.
 *
 * Everything is generated from a fixed seed, so running this twice produces the
 * same school rather than a second, different one.
 */

export const DEFAULT_PASSWORD = 'School123!';

/** Deterministic PRNG, so the generated school is reproducible. */
const makeRandom = (seed: number) => {
  let state = seed >>> 0;

  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const GIVEN_NAMES_MALE: [string, string][] = [
  ['Dara', 'តារា'], ['Sokha', 'សុខា'], ['Vichea', 'វិជ្ជា'], ['Rithy', 'រិទ្ធី'],
  ['Piseth', 'ពិសិដ្ឋ'], ['Chanthou', 'ចន្ថូ'], ['Samnang', 'សំណាង'], ['Veasna', 'វាសនា'],
  ['Sovann', 'សុវណ្ណ'], ['Kimsan', 'គីមសាន'], ['Ratana', 'រតនា'], ['Bunthoeun', 'ប៊ុនធឿន'],
  ['Chanra', 'ចន្រា'], ['Sopheak', 'សុភ័ក្ត'], ['Vuthy', 'វុទ្ធី'], ['Panha', 'បញ្ញា'],
  ['Sereivuth', 'សិរីវុទ្ធ'], ['Kosal', 'កុសល'], ['Naret', 'នរៈ'], ['Phirun', 'ភិរុណ'],
];

const GIVEN_NAMES_FEMALE: [string, string][] = [
  ['Sreymom', 'ស្រីមុំ'], ['Bopha', 'បុប្ផា'], ['Kanha', 'កញ្ញា'], ['Pisey', 'ពិសី'],
  ['Sreyneang', 'ស្រីនាង'], ['Channary', 'ចន្នារី'], ['Sokunthea', 'សុគន្ធា'], ['Davy', 'ដាវី'],
  ['Chenda', 'ចិន្តា'], ['Maly', 'ម៉ាលី'], ['Sithra', 'សិត្រា'], ['Theary', 'ធារី'],
  ['Vanna', 'វណ្ណា'], ['Nary', 'នារី'], ['Sopheap', 'សុភាព'], ['Kunthea', 'គន្ធា'],
  ['Sreypov', 'ស្រីពៅ'], ['Chanlina', 'ចន្លីណា'], ['Molika', 'មុលិកា'], ['Raksmey', 'រស្មី'],
];

const FAMILY_NAMES: [string, string][] = [
  ['Sok', 'សុខ'], ['Chan', 'ចាន់'], ['Meas', 'មាស'], ['Ly', 'លី'], ['Nov', 'នូវ'],
  ['Chea', 'ជា'], ['Kim', 'គីម'], ['Heng', 'ហេង'], ['Pich', 'ពេជ្រ'], ['Sam', 'សំ'],
  ['Long', 'ឡុង'], ['Yim', 'យីម'], ['Tep', 'ទេព'], ['Uch', 'អ៊ុច'], ['Khun', 'ឃុន'],
  ['Ros', 'រស់'], ['Hor', 'ហោ'], ['Seng', 'សេង'], ['Vong', 'វង្ស'], ['Chhim', 'ឈីម'],
  ['Nhem', 'ញ៉ែម'], ['Prak', 'ប្រាក់'], ['Touch', 'ទួច'], ['Eam', 'អៀម'], ['Mao', 'ម៉ៅ'],
];

/**
 * Weekly periods each subject receives per class, following the MoEYS
 * allocation. This is what decides how many teachers the school needs.
 */
const PERIODS_PER_WEEK: Record<string, number> = {
  KHM: 6, MATH: 6, ENG: 3, PHY: 2, CHEM: 2, BIO: 2,
  EARTH: 1, HIST: 2, GEO: 2, CIVIC: 2, ICT: 2, PE: 2,
};

/**
 * The teaching staff. A specialist covers related subjects — the science
 * teachers take physics, chemistry and earth science between them, the social
 * studies teachers take history, geography and civics — which is what brings
 * the requirement down from 27 single-subject teachers to 20.
 */
const TEACHER_SPECIALISATIONS: { subjects: string[]; count: number; label: string }[] = [
  // 66 periods over 4 teachers -> about 16 or 17 each
  { subjects: ['KHM'], count: 4, label: 'Khmer Literature' },
  { subjects: ['MATH'], count: 4, label: 'Mathematics' },
  // 33 periods over 2
  { subjects: ['ENG'], count: 2, label: 'English' },
  // The sciences are taught by one department of four: 77 periods between them
  { subjects: ['PHY', 'CHEM', 'BIO', 'EARTH'], count: 4, label: 'Science' },
  // History, geography and civics likewise: 66 periods over 4
  { subjects: ['HIST', 'GEO', 'CIVIC'], count: 4, label: 'Social Studies' },
  // Single-subject specialists, who carry every class and so run heavier
  { subjects: ['ICT'], count: 1, label: 'ICT' },
  { subjects: ['PE'], count: 1, label: 'Physical Education' },
];

/** Eleven classes: four in Grade 7, four in Grade 8, three in Grade 9. */
const CLASS_PLAN: { code: string; grade: string; size: number }[] = [
  { code: '7A', grade: 'G7', size: 26 },
  { code: '7B', grade: 'G7', size: 26 },
  { code: '7C', grade: 'G7', size: 26 },
  { code: '7D', grade: 'G7', size: 26 },
  { code: '8A', grade: 'G8', size: 25 },
  { code: '8B', grade: 'G8', size: 25 },
  { code: '8C', grade: 'G8', size: 25 },
  { code: '8D', grade: 'G8', size: 25 },
  { code: '9A', grade: 'G9', size: 21 },
  { code: '9B', grade: 'G9', size: 21 },
  { code: '9C', grade: 'G9', size: 21 },
];

const TOTAL_STUDENTS = CLASS_PLAN.reduce((sum, entry) => sum + entry.size, 0);

/** Share of students who have a brother or sister in the same school. */
const SIBLING_FAMILIES = 40;

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

export const seedSchoolPopulation = async (client: PoolClient): Promise<void> => {
  const random = makeRandom(20262027);
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  const pick = <T,>(list: T[]): T => list[Math.floor(random() * list.length)];

  // --- The year the population belongs to ----------------------------------
  const year = await client.query<{ id: number; name: string }>(
    'SELECT id, name FROM academic_years WHERE is_active = TRUE ORDER BY id LIMIT 1',
  );

  if (year.rowCount === 0) {
    throw new Error(
      'No active academic year. Create one before seeding the school population.',
    );
  }

  const academicYearId = year.rows[0].id;
  const yearLabel = year.rows[0].name;
  const startDate = (
    await client.query<{ start_date: string }>(
      'SELECT start_date FROM academic_years WHERE id = $1',
      [academicYearId],
    )
  ).rows[0].start_date;

  /**
   * Codes continue from whatever the school already entered by hand, so a
   * generated record never collides with a real one.
   */
  const nextSequence = async (table: string, column: string, prefix: string): Promise<number> => {
    const result = await client.query<{ max: number | null }>(
      `SELECT MAX(NULLIF(regexp_replace(${column}, '^.*-', ''), '')::int) AS max
         FROM ${table} WHERE ${column} LIKE $1`,
      [`${prefix}%`],
    );

    return result.rows[0]?.max ?? 0;
  };

  // --- Teachers ------------------------------------------------------------
  const teacherIds: { id: number; subjects: string[]; periods: number }[] = [];
  let teacherSeq = await nextSequence('teachers', 'teacher_code', `TCH-${yearLabel.slice(0, 4)}-`);

  for (const spec of TEACHER_SPECIALISATIONS) {
    for (let index = 0; index < spec.count; index += 1) {
      teacherSeq += 1;

      const isMale = random() < 0.5;
      const [firstEn, firstKh] = pick(isMale ? GIVEN_NAMES_MALE : GIVEN_NAMES_FEMALE);
      const [lastEn, lastKh] = pick(FAMILY_NAMES);
      const code = `TCH-${yearLabel.slice(0, 4)}-${pad(teacherSeq, 4)}`;
      const username = `teacher${pad(teacherSeq, 2)}`;

      const user = await client.query<{ id: number }>(
        `INSERT INTO users (username, email, password_hash, status, email_verified_at)
         VALUES ($1, $2, $3, 'ACTIVE', NOW())
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [username, `${username}@school.local`, passwordHash],
      );

      if (user.rowCount === 0) {
        continue;
      }

      const userId = user.rows[0].id;

      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE code = 'TEACHER'
         ON CONFLICT DO NOTHING`,
        [userId],
      );

      const teacher = await client.query<{ id: number }>(
        `INSERT INTO teachers (user_id, teacher_code, first_name_en, last_name_en,
                               first_name_kh, last_name_kh, gender, email, specialization,
                               hire_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE')
         RETURNING id`,
        [
          userId, code, firstEn, lastEn, firstKh, lastKh,
          isMale ? 'MALE' : 'FEMALE', `${username}@school.local`, spec.label, startDate,
        ],
      );

      const teacherId = teacher.rows[0].id;
      teacherIds.push({ id: teacherId, subjects: spec.subjects, periods: 0 });

      for (const subjectCode of spec.subjects) {
        await client.query(
          `INSERT INTO teacher_subjects (teacher_id, subject_id)
           SELECT $1, id FROM subjects WHERE code = $2
           ON CONFLICT DO NOTHING`,
          [teacherId, subjectCode],
        );
      }
    }
  }

  // --- Classes, each in its own home room ----------------------------------
  const classIds = new Map<string, number>();

  for (const [index, plan] of CLASS_PLAN.entries()) {
    const existing = await client.query<{ id: number }>(
      `SELECT id FROM classes
        WHERE academic_year_id = $1 AND LOWER(code) = LOWER($2) AND deleted_at IS NULL`,
      [academicYearId, plan.code],
    );

    // Homerooms are spread across the staff rather than piled on one teacher.
    const homeroom = teacherIds[index % teacherIds.length];

    const row = existing.rows[0]
      ? await client.query<{ id: number }>(
          'UPDATE classes SET homeroom_teacher_id = $2, is_active = TRUE WHERE id = $1 RETURNING id',
          [existing.rows[0].id, homeroom.id],
        )
      : await client.query<{ id: number }>(
          `INSERT INTO classes (academic_year_id, grade_level_id, homeroom_teacher_id, room_id,
                                code, name, capacity, is_active)
           SELECT $1,
                  (SELECT id FROM grade_levels WHERE code = $2),
                  $3,
                  (SELECT id FROM rooms WHERE code = $4),
                  $4, $5, 45, TRUE
        RETURNING id`,
          [academicYearId, plan.grade, homeroom.id, plan.code, `Grade ${plan.code}`],
        );

    const classId = row.rows[0].id;
    classIds.set(plan.code, classId);

    await client.query(
      `INSERT INTO teacher_classes (teacher_id, class_id, is_homeroom)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (teacher_id, class_id) DO UPDATE SET is_homeroom = TRUE`,
      [homeroom.id, classId],
    );

    // Every class is taught all twelve subjects. Each is handed to whichever
    // qualified teacher is carrying the fewest periods so far, which spreads the
    // timetable evenly instead of loading whoever happens to come first.
    for (const [subjectCode, periods] of Object.entries(PERIODS_PER_WEEK)) {
      const candidates = teacherIds.filter((teacher) => teacher.subjects.includes(subjectCode));
      const teacher = candidates.reduce((lightest, candidate) =>
        candidate.periods < lightest.periods ? candidate : lightest,
      );

      teacher.periods += periods;

      await client.query(
        `INSERT INTO class_subjects (class_id, subject_id, teacher_id)
         SELECT $1, id, $3 FROM subjects WHERE code = $2
         ON CONFLICT (class_id, subject_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id`,
        [classId, subjectCode, teacher.id],
      );

      await client.query(
        `INSERT INTO teacher_classes (teacher_id, class_id, is_homeroom)
         VALUES ($1, $2, FALSE)
         ON CONFLICT (teacher_id, class_id) DO NOTHING`,
        [teacher.id, classId],
      );
    }
  }

  // --- Students and their enrolments ---------------------------------------
  interface Enrolled {
    id: number;
    familyName: [string, string];
    grade: string;
  }

  const students: Enrolled[] = [];
  let studentSeq = await nextSequence('students', 'student_code', `STU-${yearLabel.slice(0, 4)}-`);

  for (const plan of CLASS_PLAN) {
    const classId = classIds.get(plan.code) as number;

    for (let roll = 1; roll <= plan.size; roll += 1) {
      studentSeq += 1;

      const isMale = random() < 0.5;
      const [firstEn, firstKh] = pick(isMale ? GIVEN_NAMES_MALE : GIVEN_NAMES_FEMALE);
      const familyName = pick(FAMILY_NAMES);
      const birthYear = plan.grade === 'G7' ? 2014 : plan.grade === 'G8' ? 2013 : 2012;
      const birthMonth = 1 + Math.floor(random() * 12);
      const birthDay = 1 + Math.floor(random() * 28);

      const student = await client.query<{ id: number }>(
        `INSERT INTO students (student_code, first_name_en, last_name_en, first_name_kh,
                               last_name_kh, gender, date_of_birth, enrolled_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
         RETURNING id`,
        [
          `STU-${yearLabel.slice(0, 4)}-${pad(studentSeq, 4)}`,
          firstEn, familyName[0], firstKh, familyName[1],
          isMale ? 'MALE' : 'FEMALE',
          `${birthYear}-${pad(birthMonth, 2)}-${pad(birthDay, 2)}`,
          startDate,
        ],
      );

      const studentId = student.rows[0].id;
      students.push({ id: studentId, familyName, grade: plan.grade });

      await client.query(
        `INSERT INTO enrollments (student_id, academic_year_id, class_id, roll_number,
                                  enrolled_date, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
        [studentId, academicYearId, classId, pad(roll, 2), startDate],
      );
    }
  }

  // --- Families -------------------------------------------------------------
  // Most students are the only one of their family in the school; a minority
  // have a sibling, which is what makes one guardian answer for two records.
  const shuffled = [...students].sort(() => random() - 0.5);
  const families: Enrolled[][] = [];

  let cursor = 0;

  for (let pairs = 0; pairs < SIBLING_FAMILIES && cursor + 1 < shuffled.length; pairs += 1) {
    families.push([shuffled[cursor], shuffled[cursor + 1]]);
    cursor += 2;
  }

  while (cursor < shuffled.length) {
    families.push([shuffled[cursor]]);
    cursor += 1;
  }

  let parentSeq = await nextSequence('parents', 'parent_code', `PAR-${yearLabel.slice(0, 4)}-`);
  let guardianLinks = 0;
  let secondGuardians = 0;

  for (const family of families) {
    // The family name comes from the eldest child, so a household reads
    // consistently.
    const familyName = family[0].familyName;
    // A father, a mother, or both: about a third of families register two.
    const guardianCount = random() < 0.35 ? 2 : 1;

    for (let index = 0; index < guardianCount; index += 1) {
      parentSeq += 1;

      const isFather = index === 0 ? random() < 0.5 : true;
      const [firstEn, firstKh] = pick(isFather ? GIVEN_NAMES_MALE : GIVEN_NAMES_FEMALE);

      const parent = await client.query<{ id: number }>(
        `INSERT INTO parents (parent_code, first_name_en, last_name_en, first_name_kh,
                              last_name_kh, gender, phone_number, occupation, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
         RETURNING id`,
        [
          `PAR-${yearLabel.slice(0, 4)}-${pad(parentSeq, 4)}`,
          firstEn, familyName[0], firstKh, familyName[1],
          isFather ? 'MALE' : 'FEMALE',
          `0${6 + Math.floor(random() * 4)}${pad(Math.floor(random() * 10000000), 7)}`,
          pick(['Farmer', 'Trader', 'Teacher', 'Driver', 'Tailor', 'Shop owner', 'Nurse']),
        ],
      );

      const parentId = parent.rows[0].id;

      if (index === 1) {
        secondGuardians += 1;
      }

      for (const child of family) {
        await client.query(
          `INSERT INTO student_parents (student_id, parent_id, relationship,
                                        is_primary_contact, is_emergency_contact, can_pick_up)
           VALUES ($1, $2, $3, $4, TRUE, TRUE)
           ON CONFLICT (student_id, parent_id) DO NOTHING`,
          [child.id, parentId, isFather ? 'FATHER' : 'MOTHER', index === 0],
        );

        guardianLinks += 1;
      }
    }
  }

  const twoChildFamilies = families.filter((family) => family.length === 2).length;

  logger.info(
    `Seeded the school population for ${yearLabel}: ${teacherIds.length} teachers, ` +
      `${CLASS_PLAN.length} classes, ${students.length} students, ${parentSeq} guardians`,
  );
  logger.info(
    `Families: ${families.length} (${twoChildFamilies} with two children, ` +
      `${families.length - twoChildFamilies} with one), ${secondGuardians} with a second guardian, ` +
      `${guardianLinks} guardian links`,
  );
  const loads = teacherIds.map((teacher) => teacher.periods).sort((a, b) => a - b);

  logger.info(
    `Teaching load: ${TOTAL_STUDENTS} students over ${CLASS_PLAN.length} classes; ` +
      `${Object.values(PERIODS_PER_WEEK).reduce((a, b) => a + b, 0)} periods per class per week`,
  );
  logger.info(
    `Teacher periods per week: lightest ${loads[0]}, heaviest ${loads[loads.length - 1]}, ` +
      `average ${(loads.reduce((a, b) => a + b, 0) / loads.length).toFixed(1)}`,
  );
};
