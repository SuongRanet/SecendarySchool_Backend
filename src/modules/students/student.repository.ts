import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams, SortParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { ParamBuilder, buildUpdateSet, buildWhere } from '../../utils/sql';
import type {
  CreateStudentInput,
  StudentEnrollmentHistoryRow,
  StudentFilters,
  StudentParentRow,
  StudentRow,
  UpdateStudentInput,
} from './student.types';

export const STUDENT_SORT_COLUMNS = [
  'student_code',
  'first_name_en',
  'last_name_en',
  'date_of_birth',
  'enrolled_date',
  'status',
  'created_at',
] as const;
export type StudentSortColumn = (typeof STUDENT_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<StudentSortColumn, string> = {
  student_code: 's.student_code',
  first_name_en: 's.first_name_en',
  last_name_en: 's.last_name_en',
  date_of_birth: 's.date_of_birth',
  enrolled_date: 's.enrolled_date',
  status: 's.status',
  created_at: 's.created_at',
};

/**
 * The student's *current* placement is derived from the active enrollment rather
 * than stored on the student row, so history is never overwritten.
 */
const CURRENT_ENROLLMENT_JOIN = `
  LEFT JOIN LATERAL (
    SELECT e.id, e.class_id, e.academic_year_id
      FROM enrollments e
     WHERE e.student_id = s.id AND e.status = 'ACTIVE'
     ORDER BY e.enrolled_date DESC, e.id DESC
     LIMIT 1
  ) ce ON TRUE
  LEFT JOIN classes cc ON cc.id = ce.class_id
  LEFT JOIN grade_levels cg ON cg.id = cc.grade_level_id
  LEFT JOIN academic_years cy ON cy.id = ce.academic_year_id
  LEFT JOIN users u ON u.id = s.user_id
`;

const EXTRA_SELECT = `
  u.username,
  ce.id AS current_enrollment_id,
  cc.id AS current_class_id,
  cc.name AS current_class_name,
  cg.id AS current_grade_level_id,
  cg.name_en AS current_grade_level_name,
  cy.id AS current_academic_year_id,
  cy.name AS current_academic_year_name,
  (SELECT COUNT(*)::int FROM student_parents sp WHERE sp.student_id = s.id) AS parent_count
`;

const buildConditions = (filters: StudentFilters, builder: ParamBuilder): string[] => {
  const conditions: string[] = [];

  if (!filters.includeArchived) {
    conditions.push('s.deleted_at IS NULL');
  }

  if (filters.status) {
    conditions.push(`s.status = ${builder.add(filters.status)}::student_status`);
  }

  if (filters.gender) {
    conditions.push(`s.gender = ${builder.add(filters.gender)}::gender`);
  }

  if (filters.classId !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM enrollments e2
                WHERE e2.student_id = s.id
                  AND e2.class_id = ${builder.add(filters.classId)}
                  AND e2.status = 'ACTIVE')`,
    );
  }

  if (filters.gradeLevelId !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM enrollments e3
                 JOIN classes c3 ON c3.id = e3.class_id
                WHERE e3.student_id = s.id
                  AND c3.grade_level_id = ${builder.add(filters.gradeLevelId)}
                  AND e3.status = 'ACTIVE')`,
    );
  }

  if (filters.academicYearId !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM enrollments e4
                WHERE e4.student_id = s.id
                  AND e4.academic_year_id = ${builder.add(filters.academicYearId)})`,
    );
  }

  if (filters.parentId !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM student_parents sp2
                WHERE sp2.student_id = s.id AND sp2.parent_id = ${builder.add(filters.parentId)})`,
    );
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(
      `(s.first_name_en ILIKE ${pattern}
        OR s.last_name_en ILIKE ${pattern}
        OR CONCAT(s.first_name_en, ' ', s.last_name_en) ILIKE ${pattern}
        OR s.first_name_kh ILIKE ${pattern}
        OR s.last_name_kh ILIKE ${pattern}
        OR s.student_code ILIKE ${pattern}
        OR s.phone_number ILIKE ${pattern}
        OR s.national_id ILIKE ${pattern})`,
    );
  }

  return conditions.length > 0 ? conditions : ['TRUE'];
};

export const findStudents = async (
  filters: StudentFilters,
  pagination: PaginationParams,
  sort: SortParams<StudentSortColumn>,
): Promise<PaginatedResult<StudentRow>> => {
  const builder = new ParamBuilder();
  // buildWhere drops the keyword when nothing is being filtered. Interpolating
  // `WHERE ${...}` directly produced a bare `WHERE` — and a SQL syntax error —
  // as soon as the only condition, the not-archived one, was lifted.
  const where = buildWhere(buildConditions(filters, builder));

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM students s ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<StudentRow>(
    `SELECT s.*, ${EXTRA_SELECT}
       FROM students s
       ${CURRENT_ENROLLMENT_JOIN}
       ${where}
      ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder}, s.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findStudentById = async (
  id: number,
  executor: Queryable = pool,
): Promise<StudentRow | null> => {
  const result = await executor.query<StudentRow>(
    `SELECT s.*, ${EXTRA_SELECT}
       FROM students s
       ${CURRENT_ENROLLMENT_JOIN}
      WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const findStudentByUserId = async (
  userId: number,
  executor: Queryable = pool,
): Promise<StudentRow | null> => {
  const result = await executor.query<StudentRow>(
    `SELECT s.*, ${EXTRA_SELECT}
       FROM students s
       ${CURRENT_ENROLLMENT_JOIN}
      WHERE s.user_id = $1 AND s.deleted_at IS NULL`,
    [userId],
  );

  return result.rows[0] ?? null;
};

export const findStudentByCode = async (
  code: string,
  excludeId?: number,
  executor: Queryable = pool,
): Promise<StudentRow | null> => {
  const params: unknown[] = [code];
  let sql = 'SELECT * FROM students WHERE LOWER(student_code) = LOWER($1) AND deleted_at IS NULL';

  if (excludeId !== undefined) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }

  const result = await executor.query<StudentRow>(sql, params);
  return result.rows[0] ?? null;
};

export const insertStudent = async (
  input: CreateStudentInput & { studentCode: string; userId: number | null },
  executor: Queryable = pool,
): Promise<StudentRow> => {
  const result = await executor.query<StudentRow>(
    `INSERT INTO students (
        user_id, student_code, first_name_en, last_name_en, first_name_kh, last_name_kh,
        gender, date_of_birth, place_of_birth, national_id, phone_number, email,
        current_address, province, profile_photo, enrolled_date, status, notes
     ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::gender, $8::date, $9, $10, $11, $12,
        $13, $14, $15, $16::date, COALESCE($17::student_status, 'ACTIVE'), $18
     )
     RETURNING *`,
    [
      input.userId,
      input.studentCode,
      input.firstNameEn,
      input.lastNameEn,
      input.firstNameKh ?? null,
      input.lastNameKh ?? null,
      input.gender ?? null,
      input.dateOfBirth ?? null,
      input.placeOfBirth ?? null,
      input.nationalId ?? null,
      input.phoneNumber ?? null,
      input.email ?? null,
      input.currentAddress ?? null,
      input.province ?? null,
      input.profilePhoto ?? null,
      input.enrolledDate ?? null,
      input.status ?? null,
      input.notes ?? null,
    ],
  );

  return result.rows[0];
};

export const updateStudent = async (
  id: number,
  input: UpdateStudentInput,
  executor: Queryable = pool,
): Promise<StudentRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    studentCode: { column: 'student_code' },
    firstNameEn: { column: 'first_name_en' },
    lastNameEn: { column: 'last_name_en' },
    firstNameKh: { column: 'first_name_kh' },
    lastNameKh: { column: 'last_name_kh' },
    gender: { column: 'gender', cast: 'gender' },
    dateOfBirth: { column: 'date_of_birth', cast: 'date' },
    placeOfBirth: { column: 'place_of_birth' },
    nationalId: { column: 'national_id' },
    phoneNumber: { column: 'phone_number' },
    email: { column: 'email' },
    currentAddress: { column: 'current_address' },
    province: { column: 'province' },
    profilePhoto: { column: 'profile_photo' },
    enrolledDate: { column: 'enrolled_date', cast: 'date' },
    status: { column: 'status', cast: 'student_status' },
    notes: { column: 'notes' },
  });

  if (assignments.length === 0) {
    return findStudentById(id, executor);
  }

  params.push(id);

  const result = await executor.query<StudentRow>(
    `UPDATE students SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL
      RETURNING *`,
    params,
  );

  return result.rows[0] ?? null;
};

export const linkUser = async (
  studentId: number,
  userId: number | null,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('UPDATE students SET user_id = $2 WHERE id = $1', [studentId, userId]);
};

export const softDeleteStudent = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE students SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

export const restoreStudent = async (id: number, executor: Queryable = pool): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE students SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

// ---------------------------------------------------------------------------
// Guardians
// ---------------------------------------------------------------------------

export const findStudentParents = async (
  studentId: number,
  executor: Queryable = pool,
): Promise<StudentParentRow[]> => {
  const result = await executor.query<StudentParentRow>(
    `SELECT sp.id AS link_id,
            p.id AS parent_id,
            p.parent_code,
            p.first_name_en, p.last_name_en, p.first_name_kh, p.last_name_kh,
            p.phone_number, p.email, p.occupation, p.profile_photo,
            sp.relationship, sp.is_primary_contact, sp.is_emergency_contact, sp.can_pick_up
       FROM student_parents sp
       JOIN parents p ON p.id = sp.parent_id
      WHERE sp.student_id = $1 AND p.deleted_at IS NULL
      ORDER BY sp.is_primary_contact DESC, p.first_name_en ASC`,
    [studentId],
  );

  return result.rows;
};

export const upsertStudentParent = async (
  studentId: number,
  input: {
    parentId: number;
    relationship?: string;
    isPrimaryContact?: boolean;
    isEmergencyContact?: boolean;
    canPickUp?: boolean;
  },
  executor: Queryable = pool,
): Promise<{ id: number }> => {
  // Only one guardian per student may be the primary contact.
  if (input.isPrimaryContact) {
    await executor.query(
      'UPDATE student_parents SET is_primary_contact = FALSE WHERE student_id = $1',
      [studentId],
    );
  }

  const result = await executor.query<{ id: number }>(
    `INSERT INTO student_parents
        (student_id, parent_id, relationship, is_primary_contact, is_emergency_contact, can_pick_up)
     VALUES ($1, $2, COALESCE($3::guardian_relationship, 'OTHER'), COALESCE($4, FALSE), COALESCE($5, FALSE), COALESCE($6, TRUE))
     ON CONFLICT (student_id, parent_id) DO UPDATE
       SET relationship = EXCLUDED.relationship,
           is_primary_contact = EXCLUDED.is_primary_contact,
           is_emergency_contact = EXCLUDED.is_emergency_contact,
           can_pick_up = EXCLUDED.can_pick_up
     RETURNING id`,
    [
      studentId,
      input.parentId,
      input.relationship ?? null,
      input.isPrimaryContact ?? null,
      input.isEmergencyContact ?? null,
      input.canPickUp ?? null,
    ],
  );

  return result.rows[0];
};

export const deleteStudentParent = async (
  studentId: number,
  parentId: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query(
    'DELETE FROM student_parents WHERE student_id = $1 AND parent_id = $2',
    [studentId, parentId],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

// ---------------------------------------------------------------------------
// Academic history
// ---------------------------------------------------------------------------

export const findEnrollmentHistory = async (
  studentId: number,
): Promise<StudentEnrollmentHistoryRow[]> => {
  const result = await pool.query<StudentEnrollmentHistoryRow>(
    `SELECT e.id,
            e.academic_year_id,
            y.name AS academic_year_name,
            y.start_date AS academic_year_start,
            e.class_id,
            c.name AS class_name,
            c.grade_level_id,
            g.name_en AS grade_level_name,
            g.level_order AS grade_level_order,
            NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), '') AS homeroom_teacher_name,
            e.roll_number,
            e.enrolled_date,
            e.end_date,
            e.status,
            e.remarks
       FROM enrollments e
       JOIN academic_years y ON y.id = e.academic_year_id
       JOIN classes c ON c.id = e.class_id
       JOIN grade_levels g ON g.id = c.grade_level_id
       LEFT JOIN teachers t ON t.id = c.homeroom_teacher_id
      WHERE e.student_id = $1
      ORDER BY y.start_date DESC, e.enrolled_date DESC`,
    [studentId],
  );

  return result.rows;
};

/** True when the guardian is linked to the student. */
export const parentHasStudent = async (
  parentId: number,
  studentId: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query<{ linked: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM student_parents WHERE parent_id = $1 AND student_id = $2
     ) AS linked`,
    [parentId, studentId],
  );

  return result.rows[0]?.linked ?? false;
};

/** True when the teacher currently teaches, or is homeroom teacher of, the student. */
export const teacherHasStudent = async (
  teacherId: number,
  studentId: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query<{ linked: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM enrollments e
         JOIN classes c ON c.id = e.class_id
        WHERE e.student_id = $2
          AND e.status = 'ACTIVE'
          AND (
            c.homeroom_teacher_id = $1
            OR EXISTS (SELECT 1 FROM class_subjects cs
                        WHERE cs.class_id = c.id AND cs.teacher_id = $1 AND cs.is_active)
          )
     ) AS linked`,
    [teacherId, studentId],
  );

  return result.rows[0]?.linked ?? false;
};

export const countStudentsByStatus = async (): Promise<{ status: string; count: number }[]> => {
  const result = await pool.query<{ status: string; count: number }>(
    `SELECT status::text AS status, COUNT(*)::int AS count
       FROM students
      WHERE deleted_at IS NULL
      GROUP BY status`,
  );

  return result.rows;
};
