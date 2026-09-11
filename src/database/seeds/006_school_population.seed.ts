import type { PoolClient } from 'pg';
import { hashPassword } from '../../utils/password';
import { logger } from '../../utils/logger';

/**
 * A full year group for Hun Sen Turey Secondary School: eight classes, the
 * staff who run them, 267 students and the families behind them.
 *
 * The staff are real. Their names, subjects and posts come from the school's
 * examination board appointment, so the director, the deputy
 * director and all fourteen teachers here are the people who actually hold
 * those jobs. Only the students and their guardians are generated.
 *
 * The pupil numbers are not arbitrary either: the family structure mirrors a
 * real intake, where a sizeable minority of students have a brother or sister in
 * the same school and a guardian therefore appears against two records.
 *
 * The generated half comes from a fixed seed, so running this twice produces the
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
  EARTH: 1, HIST: 2, GEO: 2, CIVIC: 2,
};

/**
 * The school's leadership, from the Grade 9 examination board appointment.
 *
 * The director chairs the examination centre and the deputy director is its
 * vice chair. In this system the director holds the principal's role; the deputy
 * holds the administrator's, because the day-to-day office work — enrolments,
 * timetables, records — is theirs.
 */
const LEADERSHIP: {
  username: string;
  firstEn: string; lastEn: string;
  firstKh: string; lastKh: string;
  gender: 'MALE' | 'FEMALE';
  role: 'PRINCIPAL' | 'ADMIN';
  title: string;
}[] = [
  {
    username: 'peng.angsum',
    firstEn: 'Angsum', lastEn: 'Peng', firstKh: 'អាំងស៊ុម', lastKh: 'ប៉េង',
    gender: 'MALE', role: 'PRINCIPAL', title: 'នាយក',
  },
  {
    username: 'noun.buntha',
    firstEn: 'Buntha', lastEn: 'Noun', firstKh: 'ប៊ុនថា', lastKh: 'នូន',
    gender: 'MALE', role: 'ADMIN', title: 'នាយករង',
  },
];

/**
 * The teaching staff, named from the examination board appointment.
 *
 * Ten of them chair a subject's marking committee, which is what fixes who
 * teaches what. The remaining four sit on the custody committee, which says
 * nothing about the subject they teach — they are put on Khmer and Mathematics
 * because those are the only two subjects one person cannot carry alone: six
 * periods across eight classes is forty-eight a week, and the timetable has only
 * forty slots in it.
 */
const STAFF: {
  firstEn: string; lastEn: string;
  firstKh: string; lastKh: string;
  gender: 'MALE' | 'FEMALE';
  subject: string;
  /** Kept so the seed can report who was named for what. */
  duty: 'marking' | 'custody';
}[] = [
  // Marking committee — one chair per examined subject
  { firstEn: 'Sieloeun', lastEn: 'Leang', firstKh: 'សៀលើន', lastKh: 'លាង', gender: 'MALE', subject: 'KHM', duty: 'marking' },
  { firstEn: 'Sreysochate', lastEn: 'Pov', firstKh: 'ស្រីសុជាតិ', lastKh: 'ពៅ', gender: 'FEMALE', subject: 'MATH', duty: 'marking' },
  { firstEn: 'Somunny', lastEn: 'Chan', firstKh: 'សុមុន្នី', lastKh: 'ចាន់', gender: 'MALE', subject: 'PHY', duty: 'marking' },
  { firstEn: 'Sopheap', lastEn: 'Heng', firstKh: 'សុភាព', lastKh: 'ហេង', gender: 'MALE', subject: 'CHEM', duty: 'marking' },
  { firstEn: 'Muyaing', lastEn: 'Tang', firstKh: 'មួយអាំង', lastKh: 'តាំង', gender: 'FEMALE', subject: 'BIO', duty: 'marking' },
  { firstEn: 'Dom', lastEn: 'Say', firstKh: 'ឌុំ', lastKh: 'សាយ', gender: 'MALE', subject: 'EARTH', duty: 'marking' },
  { firstEn: 'Nisa', lastEn: 'Yan', firstKh: 'នីសា', lastKh: 'យ៉ាន', gender: 'FEMALE', subject: 'GEO', duty: 'marking' },
  { firstEn: 'Va', lastEn: 'Leam', firstKh: 'វ៉ា', lastKh: 'លាម', gender: 'MALE', subject: 'HIST', duty: 'marking' },
  { firstEn: 'Panhea', lastEn: 'Muon', firstKh: 'បញ្ញារ', lastKh: 'មួន', gender: 'FEMALE', subject: 'CIVIC', duty: 'marking' },
  { firstEn: 'Viya', lastEn: 'Aok', firstKh: 'វិយ៉ា', lastKh: 'អោក', gender: 'FEMALE', subject: 'ENG', duty: 'marking' },
  // Custody committee — the second and third hands on the two heaviest subjects
  { firstEn: 'Chanthol', lastEn: 'He', firstKh: 'ចាន់ថុល', lastKh: 'ហេ', gender: 'FEMALE', subject: 'KHM', duty: 'custody' },
  { firstEn: 'Vanny', lastEn: 'Muon', firstKh: 'វ៉ាន់នី', lastKh: 'មួន', gender: 'FEMALE', subject: 'KHM', duty: 'custody' },
  { firstEn: 'Muykong', lastEn: 'Chap', firstKh: 'មួយគង់', lastKh: 'ចាប', gender: 'MALE', subject: 'MATH', duty: 'custody' },
  { firstEn: 'Sovannatha', lastEn: 'Sieng', firstKh: 'សុវណ្ណថា', lastKh: 'ស៊ាង', gender: 'MALE', subject: 'MATH', duty: 'custody' },
];

/**
 * Eight classes: three in Grade 7, three in Grade 8, two in Grade 9.
 *
 * The sizes add up to the school's 267 students. Grade 7 carries the largest
 * groups because an intake thins out over the cycle rather than growing.
 */
const CLASS_PLAN: { code: string; grade: string; size: number }[] = [
  { code: '7A', grade: 'G7', size: 34 },
  { code: '7B', grade: 'G7', size: 34 },
  { code: '7C', grade: 'G7', size: 34 },
  { code: '8A', grade: 'G8', size: 33 },
  { code: '8B', grade: 'G8', size: 33 },
  { code: '8C', grade: 'G8', size: 33 },
  { code: '9A', grade: 'G9', size: 33 },
  { code: '9B', grade: 'G9', size: 33 },
];

const TOTAL_STUDENTS = CLASS_PLAN.reduce((sum, entry) => sum + entry.size, 0);

/** Share of students who have a brother or sister in the same school. */
const SIBLING_FAMILIES = 40;

const pad = (value: number, width: number): string => String(value).padStart(width, '0');


/**
 * Puts the school's staff in place: the director, the deputy director and the
 * fourteen teachers named in the examination board appointment.
 *
 * Exported because the real-roster import needs exactly these people and none of
 * the generated pupils that the rest of this seed creates.
 */
export const seedStaff = async (
  client: PoolClient,
  options: { yearLabel: string; startDate: string },
): Promise<{ id: number; subjects: string[]; periods: number }[]> => {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const { yearLabel, startDate } = options;

  const ensureUser = async (username: string): Promise<number> => {
    const email = `${username}@school.local`;

    const existing = await client.query<{ id: number }>(
      `SELECT id FROM users
        WHERE (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2))
          AND deleted_at IS NULL`,
      [username, email],
    );

    if (existing.rows[0]) {
      return existing.rows[0].id;
    }

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO users (username, email, password_hash, status, email_verified_at)
       VALUES ($1, $2, $3, 'ACTIVE', NOW())
       RETURNING id`,
      [username, email, passwordHash],
    );

    return inserted.rows[0].id;
  };

  const nextSequence = async (table: string, column: string, prefix: string): Promise<number> => {
    const result = await client.query<{ max: number | null }>(
      `SELECT MAX(NULLIF(regexp_replace(${column}, '^.*-', ''), '')::int) AS max
         FROM ${table} WHERE ${column} LIKE $1`,
      [`${prefix}%`],
    );

    return result.rows[0]?.max ?? 0;
  };

// --- Leadership ----------------------------------------------------------
// The director and the deputy director are staff accounts, not teachers: they
// hold no class and appear on no timetable.
for (const leader of LEADERSHIP) {
  const userId = await ensureUser(leader.username);

  await client.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE code = $2
     ON CONFLICT DO NOTHING`,
    [userId, leader.role],
  );
}

// --- Teachers ------------------------------------------------------------
// Every member of staff is named in the examination board appointment, so
// nothing here is generated. Each teaches the one subject they were named for.
const teacherIds: { id: number; subjects: string[]; periods: number }[] = [];
let teacherSeq = await nextSequence('teachers', 'teacher_code', `TCH-${yearLabel.slice(0, 4)}-`);

for (const member of STAFF) {
  const username = `${member.lastEn}.${member.firstEn}`.toLowerCase();
  const userId = await ensureUser(username);

  // A teacher record already on this login means the staff member is in place;
  // a second run must reuse them rather than create a duplicate.
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM teachers WHERE user_id = $1 AND deleted_at IS NULL',
    [userId],
  );

  if (existing.rows[0]) {
    teacherIds.push({ id: existing.rows[0].id, subjects: [member.subject], periods: 0 });
    continue;
  }

  // Only a staff member actually being created consumes a code.
  teacherSeq += 1;
  const code = `TCH-${yearLabel.slice(0, 4)}-${pad(teacherSeq, 4)}`;

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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             (SELECT name_en FROM subjects WHERE code = $9), $10, 'ACTIVE')
     RETURNING id`,
    [
      userId, code, member.firstEn, member.lastEn, member.firstKh, member.lastKh,
      member.gender, `${username}@school.local`, member.subject, startDate,
    ],
  );

  const teacherId = teacher.rows[0].id;
  teacherIds.push({ id: teacherId, subjects: [member.subject], periods: 0 });

  await client.query(
    `INSERT INTO teacher_subjects (teacher_id, subject_id)
     SELECT $1, id FROM subjects WHERE code = $2
     ON CONFLICT DO NOTHING`,
    [teacherId, member.subject],
  );
}

  return teacherIds;
};

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
   * Refuse to run twice over the same year.
   *
   * The staff are matched on their login and reused, but pupils have no natural
   * key to match on — a second run would enrol another 267 children beside the
   * first 267 and silently double the school. Better to stop and say so than to
   * leave the office to discover it from a roll call.
   */
  const enrolled = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM enrollments
      WHERE academic_year_id = $1 AND status = 'ACTIVE'`,
    [academicYearId],
  );

  if (enrolled.rows[0].count > 0) {
    throw new Error(
      `${yearLabel} already has ${enrolled.rows[0].count} enrolled student(s), and this seed ` +
        'would add a second intake beside them. Clear the school data first with ' +
        '"npm run seed:reset-school -- --yes", then run this again.',
    );
  }

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

  /**
   * Finds or creates a login.
   *
   * `users` is unique on `LOWER(username)` and only where `deleted_at IS NULL`,
   * a partial expression index that `ON CONFLICT (username)` cannot infer, so
   * the lookup is explicit. Returning an existing account rather than failing
   * also keeps the seed re-runnable without resetting anyone's password.
   */
  const ensureUser = async (username: string): Promise<number> => {
    const email = `${username}@school.local`;

    const existing = await client.query<{ id: number }>(
      `SELECT id FROM users
        WHERE (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2))
          AND deleted_at IS NULL`,
      [username, email],
    );

    if (existing.rows[0]) {
      return existing.rows[0].id;
    }

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO users (username, email, password_hash, status, email_verified_at)
       VALUES ($1, $2, $3, 'ACTIVE', NOW())
       RETURNING id`,
      [username, email, passwordHash],
    );

    return inserted.rows[0].id;
  };

  // --- Staff -----------------------------------------------------------
  const teacherIds = await seedStaff(client, { yearLabel, startDate });

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

  // --- Classes carried over from an earlier layout --------------------------
  // The school runs 7A-7C, 8A-8C and 9A-9B. A group left over from a wider
  // layout is archived rather than dropped, and only when nobody is still
  // enrolled in it — an empty class is a layout change, a populated one is a
  // transfer the office has to make deliberately.
  const staleClasses = await client.query<{ id: number; code: string; enrolled: number }>(
    `SELECT c.id, c.code,
            (SELECT COUNT(*)::int FROM enrollments e
              WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS enrolled
       FROM classes c
      WHERE c.academic_year_id = $1
        AND c.deleted_at IS NULL
        AND c.code <> ALL($2::text[])`,
    [academicYearId, CLASS_PLAN.map((plan) => plan.code)],
  );

  for (const stale of staleClasses.rows) {
    if (stale.enrolled > 0) {
      logger.warn(
        `Class ${stale.code} is outside the current layout but still has ${stale.enrolled} ` +
          'enrolled student(s), so it was kept. Transfer them, then re-run the seed.',
      );
      continue;
    }

    await client.query('UPDATE classes SET deleted_at = NOW(), is_active = FALSE WHERE id = $1', [
      stale.id,
    ]);
    logger.info(`Archived class ${stale.code}, which is no longer part of the school`);
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

    // Two guardians means one of each, never two fathers.
    const firstIsFather = random() < 0.5;

    for (let index = 0; index < guardianCount; index += 1) {
      parentSeq += 1;

      const isFather = index === 0 ? firstIsFather : !firstIsFather;
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
