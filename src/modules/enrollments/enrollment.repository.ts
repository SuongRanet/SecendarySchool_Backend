import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams, SortParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { ENROLLED_IN_YEAR, ParamBuilder } from '../../utils/sql';
import type {
  CreateEnrollmentInput,
  EnrollmentFilters,
  EnrollmentRow,
} from './enrollment.types';

export const ENROLLMENT_SORT_COLUMNS = [
  'enrolled_date',
  'student_name',
  'class_name',
  'status',
] as const;
export type EnrollmentSortColumn = (typeof ENROLLMENT_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<EnrollmentSortColumn, string> = {
  enrolled_date: 'e.enrolled_date',
  student_name: 's.first_name_en',
  class_name: 'c.name',
  status: 'e.status',
};

const BASE_SELECT = `
  SELECT e.*,
         s.student_code,
         s.first_name_en AS student_first_name,
         s.last_name_en AS student_last_name,
         s.profile_photo AS student_photo,
         c.name AS class_name,
         c.code AS class_code,
         c.grade_level_id,
         g.name_en AS grade_level_name,
         y.name AS academic_year_name,
         y.status::text AS academic_year_status
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    JOIN classes c ON c.id = e.class_id
    JOIN grade_levels g ON g.id = c.grade_level_id
    JOIN academic_years y ON y.id = e.academic_year_id
`;

const buildConditions = (filters: EnrollmentFilters, builder: ParamBuilder): string[] => {
  const conditions = ['s.deleted_at IS NULL'];

  if (filters.academicYearId !== undefined) {
    conditions.push(`e.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.classId !== undefined) {
    conditions.push(`e.class_id = ${builder.add(filters.classId)}`);
  }

  if (filters.gradeLevelId !== undefined) {
    conditions.push(`c.grade_level_id = ${builder.add(filters.gradeLevelId)}`);
  }

  if (filters.studentId !== undefined) {
    conditions.push(`e.student_id = ${builder.add(filters.studentId)}`);
  }

  if (filters.status) {
    conditions.push(`e.status = ${builder.add(filters.status)}::enrollment_status`);
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(
      `(s.first_name_en ILIKE ${pattern}
        OR s.last_name_en ILIKE ${pattern}
        OR CONCAT(s.first_name_en, ' ', s.last_name_en) ILIKE ${pattern}
        OR s.student_code ILIKE ${pattern}
        OR c.name ILIKE ${pattern})`,
    );
  }

  return conditions;
};

export const findEnrollments = async (
  filters: EnrollmentFilters,
  pagination: PaginationParams,
  sort: SortParams<EnrollmentSortColumn>,
): Promise<PaginatedResult<EnrollmentRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN classes c ON c.id = e.class_id
       ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<EnrollmentRow>(
    `${BASE_SELECT}
     ${where}
     ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder}, e.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findEnrollmentById = async (
  id: number,
  executor: Queryable = pool,
): Promise<EnrollmentRow | null> => {
  const result = await executor.query<EnrollmentRow>(`${BASE_SELECT} WHERE e.id = $1`, [id]);
  return result.rows[0] ?? null;
};

export const findActiveEnrollment = async (
  studentId: number,
  academicYearId: number,
  executor: Queryable = pool,
): Promise<EnrollmentRow | null> => {
  const result = await executor.query<EnrollmentRow>(
    `${BASE_SELECT}
      WHERE e.student_id = $1 AND e.academic_year_id = $2 AND e.status = 'ACTIVE'
      LIMIT 1`,
    [studentId, academicYearId],
  );

  return result.rows[0] ?? null;
};

export const findCurrentEnrollment = async (
  studentId: number,
  executor: Queryable = pool,
): Promise<EnrollmentRow | null> => {
  const result = await executor.query<EnrollmentRow>(
    `${BASE_SELECT}
      WHERE e.student_id = $1 AND e.status = 'ACTIVE'
      ORDER BY e.enrolled_date DESC, e.id DESC
      LIMIT 1`,
    [studentId],
  );

  return result.rows[0] ?? null;
};

export const findEnrollmentsByStudent = async (
  studentId: number,
  executor: Queryable = pool,
): Promise<EnrollmentRow[]> => {
  const result = await executor.query<EnrollmentRow>(
    `${BASE_SELECT}
      WHERE e.student_id = $1
      ORDER BY y.start_date DESC, e.enrolled_date DESC`,
    [studentId],
  );

  return result.rows;
};

export const insertEnrollment = async (
  input: CreateEnrollmentInput & { createdBy: number | null; transferredFrom?: number | null },
  executor: Queryable = pool,
): Promise<EnrollmentRow> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO enrollments
        (student_id, academic_year_id, class_id, roll_number, enrolled_date, remarks, created_by, transferred_from)
     VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, $7, $8)
     RETURNING id`,
    [
      input.studentId,
      input.academicYearId,
      input.classId,
      input.rollNumber ?? null,
      input.enrolledDate ?? null,
      input.remarks ?? null,
      input.createdBy,
      input.transferredFrom ?? null,
    ],
  );

  const created = await findEnrollmentById(result.rows[0].id, executor);
  return created as EnrollmentRow;
};

/**
 * Closes an enrollment by setting its end date and final status. The row itself
 * is never deleted — it is the student's academic history.
 */
export const closeEnrollment = async (
  id: number,
  status: string,
  endDate: string | null,
  remarks: string | null,
  executor: Queryable = pool,
): Promise<EnrollmentRow | null> => {
  // An enrollment can never end before it began, and enrolments are routinely
  // created with a start date in the future (a student registered for next term).
  // Closing one of those on the default CURRENT_DATE would break the
  // enrollments_date_order_check constraint, so the end date is clamped to the
  // start date. Callers validate an explicitly supplied date before reaching here.
  const result = await executor.query<{ id: number }>(
    `UPDATE enrollments
        SET status = $2::enrollment_status,
            end_date = GREATEST(COALESCE($3::date, CURRENT_DATE), enrolled_date),
            remarks = COALESCE($4, remarks)
      WHERE id = $1
      RETURNING id`,
    [id, status, endDate, remarks],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return findEnrollmentById(result.rows[0].id, executor);
};

export const updateEnrollmentDetails = async (
  id: number,
  input: { rollNumber?: string | null; remarks?: string | null },
  executor: Queryable = pool,
): Promise<EnrollmentRow | null> => {
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (input.rollNumber !== undefined) {
    params.push(input.rollNumber);
    assignments.push(`roll_number = $${params.length}`);
  }

  if (input.remarks !== undefined) {
    params.push(input.remarks);
    assignments.push(`remarks = $${params.length}`);
  }

  if (assignments.length === 0) {
    return findEnrollmentById(id, executor);
  }

  params.push(id);

  await executor.query(
    `UPDATE enrollments SET ${assignments.join(', ')} WHERE id = $${params.length}`,
    params,
  );

  return findEnrollmentById(id, executor);
};

export const findActiveEnrollmentsByClass = async (
  classId: number,
  executor: Queryable = pool,
): Promise<EnrollmentRow[]> => {
  const result = await executor.query<EnrollmentRow>(
    `${BASE_SELECT} WHERE e.class_id = $1 AND e.status = 'ACTIVE' ORDER BY s.first_name_en ASC`,
    [classId],
  );

  return result.rows;
};

export const countEnrollmentsByGrade = async (
  academicYearId: number,
): Promise<{ gradeLevelId: number; gradeLevelName: string; count: number }[]> => {
  const result = await pool.query<{
    gradeLevelId: number;
    gradeLevelName: string;
    count: number;
  }>(
    `SELECT g.id AS "gradeLevelId", g.name_en AS "gradeLevelName", COUNT(e.id)::int AS count
       FROM grade_levels g
       LEFT JOIN classes c ON c.grade_level_id = g.id
                          AND c.academic_year_id = $1
                          AND c.deleted_at IS NULL
       LEFT JOIN enrollments e ON e.class_id = c.id
                              AND e.status::text IN ${ENROLLED_IN_YEAR}
      WHERE g.deleted_at IS NULL
      GROUP BY g.id, g.name_en, g.level_order
      ORDER BY g.level_order ASC`,
    [academicYearId],
  );

  return result.rows;
};

export const countEnrollmentsByClass = async (
  academicYearId: number,
): Promise<{ classId: number; className: string; count: number; capacity: number }[]> => {
  const result = await pool.query<{
    classId: number;
    className: string;
    count: number;
    capacity: number;
  }>(
    `SELECT c.id AS "classId", c.name AS "className", c.capacity,
            COUNT(e.id)::int AS count
       FROM classes c
       LEFT JOIN enrollments e ON e.class_id = c.id
                              AND e.status::text IN ${ENROLLED_IN_YEAR}
       JOIN grade_levels g ON g.id = c.grade_level_id
      WHERE c.academic_year_id = $1 AND c.deleted_at IS NULL
      GROUP BY c.id, c.name, c.capacity, g.level_order
      ORDER BY g.level_order ASC, c.name ASC`,
    [academicYearId],
  );

  return result.rows;
};

/**
 * Active enrolments in a year that sit in an exit grade.
 *
 * `grade_levels.is_exit_grade` marks the last grade of the school's cycle, and
 * this is the query that finally acts on it: those pupils leave at the end of
 * the year rather than moving up, so year-end has to treat them differently from
 * everybody else.
 */
export const findExitGradeEnrollments = async (
  academicYearId: number,
  executor: Queryable = pool,
): Promise<
  { id: number; student_id: number; class_id: number; class_name: string; grade_level_name: string }[]
> => {
  const result = await executor.query<{
    id: number; student_id: number; class_id: number;
    class_name: string; grade_level_name: string;
  }>(
    `SELECT e.id, e.student_id, e.class_id, c.name AS class_name, g.name_en AS grade_level_name
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       JOIN grade_levels g ON g.id = c.grade_level_id
       JOIN students s ON s.id = e.student_id
      WHERE e.academic_year_id = $1
        AND e.status = 'ACTIVE'
        AND g.is_exit_grade
        AND s.deleted_at IS NULL
      ORDER BY c.name, e.roll_number`,
    [academicYearId],
  );

  return result.rows;
};
