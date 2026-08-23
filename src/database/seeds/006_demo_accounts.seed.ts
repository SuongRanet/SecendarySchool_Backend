import type { PoolClient } from 'pg';
import { hashPassword } from '../../utils/password';
import { logger } from '../../utils/logger';

/**
 * The password every demo account shares. It satisfies the password policy
 * (lowercase, uppercase, digit, at least eight characters) so these accounts can
 * also be used to exercise a password change.
 */
export const DEMO_PASSWORD = 'Demo1234!';

const YEAR_NAME = '2026-2027';

interface DemoTeacher {
  code: string;
  username: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh: string;
  lastNameKh: string;
  gender: 'MALE' | 'FEMALE';
  specialization: string;
  /** Class codes this teacher is the homeroom teacher of. */
  homeroomOf: string[];
  /** `CLASS_CODE:SUBJECT_CODE` pairs this teacher teaches. */
  teaches: string[];
}

interface DemoStudent {
  code: string;
  username: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh: string;
  lastNameKh: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string;
  classCode: string;
  rollNumber: string;
}

interface DemoParent {
  code: string;
  username: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh: string;
  lastNameKh: string;
  gender: 'MALE' | 'FEMALE';
  occupation: string;
  phoneNumber: string;
  /** Student codes this guardian is linked to, with the relationship. */
  children: { studentCode: string; relationship: 'FATHER' | 'MOTHER' | 'LEGAL_GUARDIAN' }[];
}

const CLASSES = [
  { code: 'G4A', name: 'Grade 4A', gradeCode: 'G4', roomCode: 'R101' },
  { code: 'G5A', name: 'Grade 5A', gradeCode: 'G5', roomCode: 'R201' },
];

const TEACHERS: DemoTeacher[] = [
  {
    code: 'T-DEMO-01',
    username: 'teacher1',
    firstNameEn: 'Sophea',
    lastNameEn: 'Chan',
    firstNameKh: 'សុភា',
    lastNameKh: 'ចាន់',
    gender: 'FEMALE',
    specialization: 'Mathematics and Science',
    homeroomOf: ['G4A'],
    teaches: ['G4A:MATH', 'G4A:SCI', 'G5A:MATH'],
  },
  {
    code: 'T-DEMO-02',
    username: 'teacher2',
    firstNameEn: 'Dara',
    lastNameEn: 'Meas',
    firstNameKh: 'តារា',
    lastNameKh: 'មាស',
    gender: 'MALE',
    specialization: 'Languages',
    homeroomOf: [],
    teaches: ['G4A:ENG', 'G4A:KHM', 'G5A:ENG', 'G5A:KHM'],
  },
  {
    code: 'T-DEMO-03',
    username: 'teacher3',
    firstNameEn: 'Vichea',
    lastNameEn: 'Kim',
    firstNameKh: 'វិជ្ជា',
    lastNameKh: 'គីម',
    gender: 'MALE',
    specialization: 'Social Studies',
    homeroomOf: ['G5A'],
    teaches: ['G5A:SOC', 'G5A:SCI', 'G4A:SOC'],
  },
];

const STUDENTS: DemoStudent[] = [
  {
    code: 'S-DEMO-01',
    username: 'student1',
    firstNameEn: 'Rithy',
    lastNameEn: 'Sok',
    firstNameKh: 'រិទ្ធី',
    lastNameKh: 'សុខ',
    gender: 'MALE',
    dateOfBirth: '2016-03-14',
    classCode: 'G4A',
    rollNumber: '01',
  },
  {
    code: 'S-DEMO-02',
    username: 'student2',
    firstNameEn: 'Sreymom',
    lastNameEn: 'Chea',
    firstNameKh: 'ស្រីមុំ',
    lastNameKh: 'ជា',
    gender: 'FEMALE',
    dateOfBirth: '2016-07-02',
    classCode: 'G4A',
    rollNumber: '02',
  },
  {
    code: 'S-DEMO-03',
    username: 'student3',
    firstNameEn: 'Pisey',
    lastNameEn: 'Nov',
    firstNameKh: 'ពិសី',
    lastNameKh: 'នូវ',
    gender: 'FEMALE',
    dateOfBirth: '2016-11-20',
    classCode: 'G4A',
    rollNumber: '03',
  },
  {
    code: 'S-DEMO-04',
    username: 'student4',
    firstNameEn: 'Bopha',
    lastNameEn: 'Sok',
    firstNameKh: 'បុប្ផា',
    lastNameKh: 'សុខ',
    gender: 'FEMALE',
    dateOfBirth: '2015-05-09',
    classCode: 'G5A',
    rollNumber: '01',
  },
  {
    code: 'S-DEMO-05',
    username: 'student5',
    firstNameEn: 'Sokha',
    lastNameEn: 'Ly',
    firstNameKh: 'សុខា',
    lastNameKh: 'លី',
    gender: 'MALE',
    dateOfBirth: '2015-09-27',
    classCode: 'G5A',
    rollNumber: '02',
  },
  {
    code: 'S-DEMO-06',
    username: 'student6',
    firstNameEn: 'Kanha',
    lastNameEn: 'Chea',
    firstNameKh: 'កញ្ញា',
    lastNameKh: 'ជា',
    gender: 'FEMALE',
    dateOfBirth: '2015-01-31',
    classCode: 'G5A',
    rollNumber: '03',
  },
];

const PARENTS: DemoParent[] = [
  {
    code: 'P-DEMO-01',
    username: 'parent1',
    firstNameEn: 'Vanna',
    lastNameEn: 'Sok',
    firstNameKh: 'វណ្ណា',
    lastNameKh: 'សុខ',
    gender: 'MALE',
    occupation: 'Shop owner',
    phoneNumber: '012345001',
    // Two children in two different classes, so the child switcher has something to switch.
    children: [
      { studentCode: 'S-DEMO-01', relationship: 'FATHER' },
      { studentCode: 'S-DEMO-04', relationship: 'FATHER' },
    ],
  },
  {
    code: 'P-DEMO-02',
    username: 'parent2',
    firstNameEn: 'Chanthou',
    lastNameEn: 'Chea',
    firstNameKh: 'ចន្ថូ',
    lastNameKh: 'ជា',
    gender: 'FEMALE',
    occupation: 'Nurse',
    phoneNumber: '012345002',
    children: [
      { studentCode: 'S-DEMO-02', relationship: 'MOTHER' },
      { studentCode: 'S-DEMO-06', relationship: 'MOTHER' },
    ],
  },
  {
    code: 'P-DEMO-03',
    username: 'parent3',
    firstNameEn: 'Sina',
    lastNameEn: 'Nov',
    firstNameKh: 'ស៊ីណា',
    lastNameKh: 'នូវ',
    gender: 'FEMALE',
    occupation: 'Teacher',
    phoneNumber: '012345003',
    children: [
      { studentCode: 'S-DEMO-03', relationship: 'MOTHER' },
      { studentCode: 'S-DEMO-05', relationship: 'LEGAL_GUARDIAN' },
    ],
  },
];

/** Creates or updates the login for a demo profile and gives it a single role. */
const upsertAccount = async (
  client: PoolClient,
  username: string,
  email: string,
  roleCode: string,
  passwordHash: string,
): Promise<number> => {
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL',
    [username],
  );

  const userId = existing.rows[0]
    ? (
        await client.query<{ id: number }>(
          `UPDATE users
              SET email = $2, password_hash = $3, status = 'ACTIVE', email_verified_at = NOW()
            WHERE id = $1
        RETURNING id`,
          [existing.rows[0].id, email, passwordHash],
        )
      ).rows[0].id
    : (
        await client.query<{ id: number }>(
          `INSERT INTO users (username, email, password_hash, status, email_verified_at)
           VALUES ($1, $2, $3, 'ACTIVE', NOW())
        RETURNING id`,
          [username, email, passwordHash],
        )
      ).rows[0].id;

  await client.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE code = $2
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleCode],
  );

  return userId;
};

/**
 * Seeds a small but complete school: an academic year with two classes, three
 * teachers, six enrolled students and three guardians, each with a login. Every
 * step upserts on the demo code, so re-running it refreshes the passwords
 * instead of creating a second set of people.
 */
export const seedDemoAccounts = async (client: PoolClient): Promise<void> => {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // --- Academic year -------------------------------------------------------
  // The demo data lives in whichever year the school is currently working in.
  // Anchoring on a year *name* would be fragile: renaming the year would make a
  // later run build a second parallel set of classes and enrolments, so the
  // active year is preferred and a new one is only created as a last resort.
  const existingYear = await client.query<{ id: number }>(
    `SELECT id FROM academic_years WHERE is_active = TRUE
     UNION ALL
     SELECT academic_year_id FROM classes
      WHERE code IN ('G4A', 'G5A') AND deleted_at IS NULL
     LIMIT 1`,
  );

  const yearId =
    existingYear.rows[0]?.id ??
    (
      await client.query<{ id: number }>(
        `INSERT INTO academic_years (name, start_date, end_date, status, is_active)
         VALUES ($1, '2026-09-01', '2027-07-31', 'ACTIVE', TRUE)
         ON CONFLICT (name) DO UPDATE SET status = 'ACTIVE'
         RETURNING id`,
        [YEAR_NAME],
      )
    ).rows[0].id;

  // Split the year in half so the terms always sit inside it, whichever year
  // the demo data landed in.
  await client.query(
    `INSERT INTO academic_terms (academic_year_id, name, term_order, start_date, end_date, is_active)
     SELECT id, 'Term 1', 1, start_date, start_date + (end_date - start_date) / 2, TRUE
       FROM academic_years WHERE id = $1
     UNION ALL
     SELECT id, 'Term 2', 2, start_date + (end_date - start_date) / 2 + 1, end_date, FALSE
       FROM academic_years WHERE id = $1
     ON CONFLICT (academic_year_id, term_order) DO NOTHING`,
    [yearId],
  );

  // --- Teachers ------------------------------------------------------------
  const teacherIds = new Map<string, number>();

  for (const teacher of TEACHERS) {
    const userId = await upsertAccount(
      client,
      teacher.username,
      `${teacher.username}@school.local`,
      'TEACHER',
      passwordHash,
    );

    const row = await client.query<{ id: number }>(
      `INSERT INTO teachers (user_id, teacher_code, first_name_en, last_name_en, first_name_kh,
                             last_name_kh, gender, email, specialization, hire_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '2024-08-01', 'ACTIVE')
       ON CONFLICT (teacher_code) DO UPDATE
         SET user_id = EXCLUDED.user_id, status = 'ACTIVE', deleted_at = NULL
    RETURNING id`,
      [
        userId,
        teacher.code,
        teacher.firstNameEn,
        teacher.lastNameEn,
        teacher.firstNameKh,
        teacher.lastNameKh,
        teacher.gender,
        `${teacher.username}@school.local`,
        teacher.specialization,
      ],
    );

    teacherIds.set(teacher.code, row.rows[0].id);
  }

  // --- Classes -------------------------------------------------------------
  const classIds = new Map<string, number>();

  for (const schoolClass of CLASSES) {
    const homeroom = TEACHERS.find((teacher) => teacher.homeroomOf.includes(schoolClass.code));

    const homeroomId = homeroom ? teacherIds.get(homeroom.code) : null;

    // The unique index is on (academic_year_id, LOWER(code)) and is partial, so
    // look the row up rather than relying on ON CONFLICT inference.
    const existing = await client.query<{ id: number }>(
      `SELECT id FROM classes
        WHERE academic_year_id = $1 AND LOWER(code) = LOWER($2) AND deleted_at IS NULL`,
      [yearId, schoolClass.code],
    );

    const row = existing.rows[0]
      ? await client.query<{ id: number }>(
          `UPDATE classes
              SET homeroom_teacher_id = $2, is_active = TRUE
            WHERE id = $1
        RETURNING id`,
          [existing.rows[0].id, homeroomId],
        )
      : await client.query<{ id: number }>(
          `INSERT INTO classes (academic_year_id, grade_level_id, homeroom_teacher_id, room_id,
                                code, name, capacity, is_active)
           SELECT $1,
                  (SELECT id FROM grade_levels WHERE code = $2),
                  $3,
                  (SELECT id FROM rooms WHERE code = $4),
                  $5, $6, 40, TRUE
        RETURNING id`,
          [yearId, schoolClass.gradeCode, homeroomId, schoolClass.roomCode, schoolClass.code, schoolClass.name],
        );

    classIds.set(schoolClass.code, row.rows[0].id);
  }

  // --- Teaching assignments ------------------------------------------------
  for (const teacher of TEACHERS) {
    const teacherId = teacherIds.get(teacher.code);

    for (const pair of teacher.teaches) {
      const [classCode, subjectCode] = pair.split(':');
      const classId = classIds.get(classCode);

      await client.query(
        `INSERT INTO class_subjects (class_id, subject_id, teacher_id)
         SELECT $1, (SELECT id FROM subjects WHERE code = $2), $3
         ON CONFLICT (class_id, subject_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id`,
        [classId, subjectCode, teacherId],
      );

      await client.query(
        `INSERT INTO teacher_classes (teacher_id, class_id, is_homeroom)
         VALUES ($1, $2, $3)
         ON CONFLICT (teacher_id, class_id) DO UPDATE SET is_homeroom = EXCLUDED.is_homeroom`,
        [teacherId, classId, teacher.homeroomOf.includes(classCode)],
      );
    }
  }

  // --- Students and enrollments -------------------------------------------
  const studentIds = new Map<string, number>();

  for (const student of STUDENTS) {
    const userId = await upsertAccount(
      client,
      student.username,
      `${student.username}@school.local`,
      'STUDENT',
      passwordHash,
    );

    const row = await client.query<{ id: number }>(
      `INSERT INTO students (user_id, student_code, first_name_en, last_name_en, first_name_kh,
                             last_name_kh, gender, date_of_birth, enrolled_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '2026-09-01', 'ACTIVE')
       ON CONFLICT (student_code) DO UPDATE
         SET user_id = EXCLUDED.user_id, status = 'ACTIVE', deleted_at = NULL
    RETURNING id`,
      [
        userId,
        student.code,
        student.firstNameEn,
        student.lastNameEn,
        student.firstNameKh,
        student.lastNameKh,
        student.gender,
        student.dateOfBirth,
      ],
    );

    const studentId = row.rows[0].id;
    studentIds.set(student.code, studentId);

    // The enrollment is the student↔class link, so it carries the academic year.
    const enrolled = await client.query(
      `SELECT 1 FROM enrollments
        WHERE student_id = $1 AND academic_year_id = $2 AND status = 'ACTIVE'`,
      [studentId, yearId],
    );

    if (enrolled.rowCount === 0) {
      // The enrolment starts when the year it belongs to starts.
      await client.query(
        `INSERT INTO enrollments (student_id, academic_year_id, class_id, roll_number,
                                  enrolled_date, status)
         SELECT $1, $2, $3, $4, start_date, 'ACTIVE'
           FROM academic_years WHERE id = $2`,
        [studentId, yearId, classIds.get(student.classCode), student.rollNumber],
      );
    }
  }

  // --- Guardians -----------------------------------------------------------
  for (const parent of PARENTS) {
    const userId = await upsertAccount(
      client,
      parent.username,
      `${parent.username}@school.local`,
      'PARENT',
      passwordHash,
    );

    const row = await client.query<{ id: number }>(
      `INSERT INTO parents (user_id, parent_code, first_name_en, last_name_en, first_name_kh,
                            last_name_kh, gender, phone_number, email, occupation, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
       ON CONFLICT (parent_code) DO UPDATE
         SET user_id = EXCLUDED.user_id, is_active = TRUE, deleted_at = NULL
    RETURNING id`,
      [
        userId,
        parent.code,
        parent.firstNameEn,
        parent.lastNameEn,
        parent.firstNameKh,
        parent.lastNameKh,
        parent.gender,
        parent.phoneNumber,
        `${parent.username}@school.local`,
        parent.occupation,
      ],
    );

    const parentId = row.rows[0].id;

    for (const [index, child] of parent.children.entries()) {
      await client.query(
        `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary_contact,
                                      is_emergency_contact, can_pick_up)
         VALUES ($1, $2, $3, $4, TRUE, TRUE)
         ON CONFLICT (student_id, parent_id) DO UPDATE
           SET relationship = EXCLUDED.relationship`,
        [studentIds.get(child.studentCode), parentId, child.relationship, index === 0],
      );
    }
  }

  logger.info(
    `Demo accounts seeded: ${TEACHERS.length} teachers, ${STUDENTS.length} students, ${PARENTS.length} guardians`,
  );
};
