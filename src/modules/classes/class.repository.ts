import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams, SortParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  ClassFilters,
  ClassRow,
  ClassStudentRow,
  ClassSubjectRow,
  CreateClassInput,
  UpdateClassInput,
} from './class.types';

export const CLASS_SORT_COLUMNS = ['name', 'code', 'capacity', 'grade_level', 'created_at'] as const;
export type ClassSortColumn = (typeof CLASS_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<ClassSortColumn, string> = {
  name: 'c.name',
  code: 'c.code',
  capacity: 'c.capacity',
  grade_level: 'g.level_order',
  created_at: 'c.created_at',
};

const EXTRA_SELECT = `
  y.name AS academic_year_name,
  y.status AS academic_year_status,
  g.name_en AS grade_level_name,
  g.level_order AS grade_level_order,
  NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), '') AS homeroom_teacher_name,
  r.name AS room_name,
  (SELECT COUNT(*)::int FROM enrollments e
    WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS enrolled_count,
  (SELECT COUNT(*)::int FROM class_subjects cs
    WHERE cs.class_id = c.id AND cs.is_active) AS subject_count
`;

const BASE_JOINS = `
  JOIN academic_years y ON y.id = c.academic_year_id
  JOIN grade_levels g ON g.id = c.grade_level_id
  LEFT JOIN teachers t ON t.id = c.homeroom_teacher_id
  LEFT JOIN rooms r ON r.id = c.room_id
`;

const buildConditions = (filters: ClassFilters, builder: ParamBuilder): string[] => {
  const conditions = ['c.deleted_at IS NULL'];

  if (filters.academicYearId !== undefined) {
    conditions.push(`c.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.gradeLevelId !== undefined) {
    conditions.push(`c.grade_level_id = ${builder.add(filters.gradeLevelId)}`);
  }

  if (filters.homeroomTeacherId !== undefined) {
    conditions.push(`c.homeroom_teacher_id = ${builder.add(filters.homeroomTeacherId)}`);
  }

  if (filters.teacherId !== undefined) {
    const teacherId = builder.add(filters.teacherId);
    conditions.push(
      `(c.homeroom_teacher_id = ${teacherId}
        OR EXISTS (SELECT 1 FROM class_subjects cs2
                    WHERE cs2.class_id = c.id AND cs2.teacher_id = ${teacherId} AND cs2.is_active))`,
    );
  }

  if (filters.isActive !== undefined) {
    conditions.push(`c.is_active = ${builder.add(filters.isActive)}`);
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(`(c.name ILIKE ${pattern} OR c.code ILIKE ${pattern} OR g.name_en ILIKE ${pattern})`);
  }

  return conditions;
};

export const findClasses = async (
  filters: ClassFilters,
  pagination: PaginationParams,
  sort: SortParams<ClassSortColumn>,
): Promise<PaginatedResult<ClassRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM classes c ${BASE_JOINS} ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<ClassRow>(
    `SELECT c.*, ${EXTRA_SELECT}
       FROM classes c
       ${BASE_JOINS}
       ${where}
      ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder}, c.name ASC
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAllClasses = async (filters: ClassFilters = {}): Promise<ClassRow[]> => {
  const builder = new ParamBuilder();

  const result = await pool.query<ClassRow>(
    `SELECT c.*, ${EXTRA_SELECT}
       FROM classes c
       ${BASE_JOINS}
      WHERE ${buildConditions(filters, builder).join(' AND ')}
      ORDER BY g.level_order ASC, c.name ASC`,
    builder.params,
  );

  return result.rows;
};

export const findClassById = async (
  id: number,
  executor: Queryable = pool,
): Promise<ClassRow | null> => {
  const result = await executor.query<ClassRow>(
    `SELECT c.*, ${EXTRA_SELECT}
       FROM classes c
       ${BASE_JOINS}
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const findClassByCode = async (
  academicYearId: number,
  code: string,
  excludeId?: number,
  executor: Queryable = pool,
): Promise<ClassRow | null> => {
  const params: unknown[] = [academicYearId, code];
  let sql = `SELECT * FROM classes
              WHERE academic_year_id = $1 AND LOWER(code) = LOWER($2) AND deleted_at IS NULL`;

  if (excludeId !== undefined) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }

  const result = await executor.query<ClassRow>(sql, params);
  return result.rows[0] ?? null;
};

export const insertClass = async (
  input: CreateClassInput,
  executor: Queryable = pool,
): Promise<ClassRow> => {
  const result = await executor.query<ClassRow>(
    `INSERT INTO classes (
        academic_year_id, grade_level_id, homeroom_teacher_id, room_id,
        code, name, capacity, description, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 40), $8, COALESCE($9, TRUE))
     RETURNING *`,
    [
      input.academicYearId,
      input.gradeLevelId,
      input.homeroomTeacherId ?? null,
      input.roomId ?? null,
      input.code,
      input.name,
      input.capacity ?? null,
      input.description ?? null,
      input.isActive ?? null,
    ],
  );

  return result.rows[0];
};

export const updateClass = async (
  id: number,
  input: UpdateClassInput,
  executor: Queryable = pool,
): Promise<ClassRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    gradeLevelId: { column: 'grade_level_id' },
    homeroomTeacherId: { column: 'homeroom_teacher_id' },
    roomId: { column: 'room_id' },
    code: { column: 'code' },
    name: { column: 'name' },
    capacity: { column: 'capacity' },
    description: { column: 'description' },
    isActive: { column: 'is_active' },
  });

  if (assignments.length === 0) {
    return findClassById(id, executor);
  }

  params.push(id);

  const result = await executor.query<ClassRow>(
    `UPDATE classes SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL
      RETURNING *`,
    params,
  );

  return result.rows[0] ?? null;
};

export const softDeleteClass = async (id: number, executor: Queryable = pool): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE classes SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

export const countActiveEnrollments = async (
  classId: number,
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM enrollments WHERE class_id = $1 AND status = 'ACTIVE'`,
    [classId],
  );

  return result.rows[0]?.count ?? 0;
};

export const countEnrollmentsEver = async (
  classId: number,
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM enrollments WHERE class_id = $1',
    [classId],
  );

  return result.rows[0]?.count ?? 0;
};

// ---------------------------------------------------------------------------
// Class subjects
// ---------------------------------------------------------------------------

const CLASS_SUBJECT_SELECT = `
  SELECT cs.id, cs.class_id, cs.subject_id, cs.teacher_id, cs.weight, cs.is_active,
         s.code AS subject_code,
         s.name_en AS subject_name_en,
         s.name_kh AS subject_name_kh,
         NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), '') AS teacher_name,
         (SELECT COUNT(*)::int FROM assessments a
           WHERE a.class_id = cs.class_id AND a.subject_id = cs.subject_id
             AND a.deleted_at IS NULL) AS assessment_count
    FROM class_subjects cs
    JOIN subjects s ON s.id = cs.subject_id
    LEFT JOIN teachers t ON t.id = cs.teacher_id
`;

export const findClassSubjects = async (
  classId: number,
  executor: Queryable = pool,
): Promise<ClassSubjectRow[]> => {
  const result = await executor.query<ClassSubjectRow>(
    `${CLASS_SUBJECT_SELECT} WHERE cs.class_id = $1 ORDER BY s.name_en ASC`,
    [classId],
  );

  return result.rows;
};

export const findClassSubjectById = async (
  id: number,
  executor: Queryable = pool,
): Promise<ClassSubjectRow | null> => {
  const result = await executor.query<ClassSubjectRow>(`${CLASS_SUBJECT_SELECT} WHERE cs.id = $1`, [
    id,
  ]);

  return result.rows[0] ?? null;
};

export const upsertClassSubject = async (
  classId: number,
  input: { subjectId: number; teacherId?: number | null; weight?: number; isActive?: boolean },
  executor: Queryable = pool,
): Promise<{ id: number }> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO class_subjects (class_id, subject_id, teacher_id, weight, is_active)
     VALUES ($1, $2, $3, COALESCE($4, 1), COALESCE($5, TRUE))
     ON CONFLICT (class_id, subject_id) DO UPDATE
       SET teacher_id = EXCLUDED.teacher_id,
           weight = EXCLUDED.weight,
           is_active = EXCLUDED.is_active
     RETURNING id`,
    [classId, input.subjectId, input.teacherId ?? null, input.weight ?? null, input.isActive ?? null],
  );

  return result.rows[0];
};

export const deleteClassSubject = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query('DELETE FROM class_subjects WHERE id = $1', [id]);
  return result.rowCount !== null && result.rowCount > 0;
};

export const countAssessmentsForClassSubject = async (
  classId: number,
  subjectId: number,
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM assessments
      WHERE class_id = $1 AND subject_id = $2 AND deleted_at IS NULL`,
    [classId, subjectId],
  );

  return result.rows[0]?.count ?? 0;
};

// ---------------------------------------------------------------------------
// Class students
// ---------------------------------------------------------------------------

export const findClassStudents = async (
  classId: number,
  includeInactive = false,
): Promise<ClassStudentRow[]> => {
  const result = await pool.query<ClassStudentRow>(
    `SELECT e.id AS enrollment_id,
            s.id AS student_id,
            s.student_code,
            s.first_name_en, s.last_name_en, s.first_name_kh, s.last_name_kh,
            s.gender, s.date_of_birth, s.profile_photo,
            s.status AS student_status,
            e.status AS enrollment_status,
            e.roll_number,
            e.enrolled_date
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
      WHERE e.class_id = $1
        AND s.deleted_at IS NULL
        AND ($2::boolean OR e.status = 'ACTIVE')
      ORDER BY
        COALESCE(NULLIF(e.roll_number, '')::text, '999999'),
        s.first_name_en ASC, s.last_name_en ASC`,
    [classId, includeInactive],
  );

  return result.rows;
};
