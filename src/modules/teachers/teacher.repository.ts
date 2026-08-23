import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams, SortParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  CreateTeacherInput,
  TeacherAssignmentRow,
  TeacherFilters,
  TeacherRow,
  TeacherScheduleRow,
  UpdateTeacherInput,
} from './teacher.types';

export const TEACHER_SORT_COLUMNS = [
  'teacher_code',
  'first_name_en',
  'last_name_en',
  'hire_date',
  'status',
  'created_at',
] as const;
export type TeacherSortColumn = (typeof TEACHER_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<TeacherSortColumn, string> = {
  teacher_code: 't.teacher_code',
  first_name_en: 't.first_name_en',
  last_name_en: 't.last_name_en',
  hire_date: 't.hire_date',
  status: 't.status',
  created_at: 't.created_at',
};

const EXTRA_SELECT = `
  u.username,
  COALESCE(
    (SELECT ARRAY_AGG(DISTINCT ts.subject_id) FROM teacher_subjects ts WHERE ts.teacher_id = t.id),
    ARRAY[]::bigint[]
  ) AS subject_ids,
  COALESCE(
    (SELECT ARRAY_AGG(c.id) FROM classes c
      WHERE c.homeroom_teacher_id = t.id AND c.deleted_at IS NULL),
    ARRAY[]::bigint[]
  ) AS homeroom_class_ids,
  (SELECT COUNT(DISTINCT cs.class_id)::int
     FROM class_subjects cs WHERE cs.teacher_id = t.id AND cs.is_active) AS class_count,
  (SELECT COUNT(DISTINCT e.student_id)::int
     FROM enrollments e
    WHERE e.status = 'ACTIVE'
      AND e.class_id IN (
        SELECT cs2.class_id FROM class_subjects cs2 WHERE cs2.teacher_id = t.id AND cs2.is_active
        UNION
        SELECT c2.id FROM classes c2 WHERE c2.homeroom_teacher_id = t.id AND c2.deleted_at IS NULL
      )) AS student_count
`;

const buildConditions = (filters: TeacherFilters, builder: ParamBuilder): string[] => {
  const conditions = ['t.deleted_at IS NULL'];

  if (filters.status) {
    conditions.push(`t.status = ${builder.add(filters.status)}::staff_status`);
  }

  if (filters.subjectId !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM teacher_subjects ts2
                WHERE ts2.teacher_id = t.id AND ts2.subject_id = ${builder.add(filters.subjectId)})`,
    );
  }

  if (filters.classId !== undefined) {
    const classId = builder.add(filters.classId);
    conditions.push(
      `(EXISTS (SELECT 1 FROM class_subjects cs3 WHERE cs3.teacher_id = t.id AND cs3.class_id = ${classId})
        OR EXISTS (SELECT 1 FROM classes c3 WHERE c3.homeroom_teacher_id = t.id AND c3.id = ${classId}))`,
    );
  }

  if (filters.hasAccount !== undefined) {
    conditions.push(filters.hasAccount ? 't.user_id IS NOT NULL' : 't.user_id IS NULL');
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(
      `(t.first_name_en ILIKE ${pattern}
        OR t.last_name_en ILIKE ${pattern}
        OR CONCAT(t.first_name_en, ' ', t.last_name_en) ILIKE ${pattern}
        OR t.first_name_kh ILIKE ${pattern}
        OR t.last_name_kh ILIKE ${pattern}
        OR t.teacher_code ILIKE ${pattern}
        OR t.phone_number ILIKE ${pattern}
        OR t.email ILIKE ${pattern})`,
    );
  }

  return conditions;
};

export const findTeachers = async (
  filters: TeacherFilters,
  pagination: PaginationParams,
  sort: SortParams<TeacherSortColumn>,
): Promise<PaginatedResult<TeacherRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM teachers t ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<TeacherRow>(
    `SELECT t.*, ${EXTRA_SELECT}
       FROM teachers t
       LEFT JOIN users u ON u.id = t.user_id
       ${where}
      ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder}, t.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAllTeachers = async (filters: TeacherFilters = {}): Promise<TeacherRow[]> => {
  const builder = new ParamBuilder();

  const result = await pool.query<TeacherRow>(
    `SELECT t.*, ${EXTRA_SELECT}
       FROM teachers t
       LEFT JOIN users u ON u.id = t.user_id
      WHERE ${buildConditions(filters, builder).join(' AND ')}
      ORDER BY t.first_name_en ASC, t.last_name_en ASC`,
    builder.params,
  );

  return result.rows;
};

export const findTeacherById = async (
  id: number,
  executor: Queryable = pool,
): Promise<TeacherRow | null> => {
  const result = await executor.query<TeacherRow>(
    `SELECT t.*, ${EXTRA_SELECT}
       FROM teachers t
       LEFT JOIN users u ON u.id = t.user_id
      WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const findTeacherByUserId = async (
  userId: number,
  executor: Queryable = pool,
): Promise<TeacherRow | null> => {
  const result = await executor.query<TeacherRow>(
    `SELECT t.*, ${EXTRA_SELECT}
       FROM teachers t
       LEFT JOIN users u ON u.id = t.user_id
      WHERE t.user_id = $1 AND t.deleted_at IS NULL`,
    [userId],
  );

  return result.rows[0] ?? null;
};

export const findTeacherByCode = async (
  code: string,
  excludeId?: number,
  executor: Queryable = pool,
): Promise<TeacherRow | null> => {
  const params: unknown[] = [code];
  let sql = 'SELECT * FROM teachers WHERE LOWER(teacher_code) = LOWER($1) AND deleted_at IS NULL';

  if (excludeId !== undefined) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }

  const result = await executor.query<TeacherRow>(sql, params);
  return result.rows[0] ?? null;
};

export const insertTeacher = async (
  input: CreateTeacherInput & { teacherCode: string; userId: number | null },
  executor: Queryable = pool,
): Promise<TeacherRow> => {
  const result = await executor.query<TeacherRow>(
    `INSERT INTO teachers (
        user_id, teacher_code, first_name_en, last_name_en, first_name_kh, last_name_kh,
        gender, date_of_birth, national_id, phone_number, email, address,
        qualification, specialization, hire_date, status, profile_photo, notes
     ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::gender, $8::date, $9, $10, $11, $12,
        $13, $14, $15::date, COALESCE($16::staff_status, 'ACTIVE'), $17, $18
     )
     RETURNING *`,
    [
      input.userId,
      input.teacherCode,
      input.firstNameEn,
      input.lastNameEn,
      input.firstNameKh ?? null,
      input.lastNameKh ?? null,
      input.gender ?? null,
      input.dateOfBirth ?? null,
      input.nationalId ?? null,
      input.phoneNumber ?? null,
      input.email ?? null,
      input.address ?? null,
      input.qualification ?? null,
      input.specialization ?? null,
      input.hireDate ?? null,
      input.status ?? null,
      input.profilePhoto ?? null,
      input.notes ?? null,
    ],
  );

  return result.rows[0];
};

export const updateTeacher = async (
  id: number,
  input: UpdateTeacherInput,
  executor: Queryable = pool,
): Promise<TeacherRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    teacherCode: { column: 'teacher_code' },
    firstNameEn: { column: 'first_name_en' },
    lastNameEn: { column: 'last_name_en' },
    firstNameKh: { column: 'first_name_kh' },
    lastNameKh: { column: 'last_name_kh' },
    gender: { column: 'gender', cast: 'gender' },
    dateOfBirth: { column: 'date_of_birth', cast: 'date' },
    nationalId: { column: 'national_id' },
    phoneNumber: { column: 'phone_number' },
    email: { column: 'email' },
    address: { column: 'address' },
    qualification: { column: 'qualification' },
    specialization: { column: 'specialization' },
    hireDate: { column: 'hire_date', cast: 'date' },
    status: { column: 'status', cast: 'staff_status' },
    profilePhoto: { column: 'profile_photo' },
    notes: { column: 'notes' },
  });

  if (assignments.length === 0) {
    return findTeacherById(id, executor);
  }

  params.push(id);

  const result = await executor.query<TeacherRow>(
    `UPDATE teachers SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL
      RETURNING *`,
    params,
  );

  return result.rows[0] ?? null;
};

export const linkUser = async (
  teacherId: number,
  userId: number | null,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('UPDATE teachers SET user_id = $2 WHERE id = $1', [teacherId, userId]);
};

export const softDeleteTeacher = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query(
    `UPDATE teachers SET deleted_at = NOW(), status = 'RESIGNED'::staff_status
      WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

export const replaceTeacherSubjects = async (
  teacherId: number,
  subjectIds: readonly number[],
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('DELETE FROM teacher_subjects WHERE teacher_id = $1', [teacherId]);

  if (subjectIds.length === 0) {
    return;
  }

  await executor.query(
    `INSERT INTO teacher_subjects (teacher_id, subject_id)
     SELECT $1, subject_id FROM UNNEST($2::bigint[]) AS subject_id
     ON CONFLICT (teacher_id, subject_id) DO NOTHING`,
    [teacherId, subjectIds],
  );
};

/** Every class subject a teacher is responsible for, plus their homerooms. */
export const findTeacherAssignments = async (
  teacherId: number,
  academicYearId?: number,
): Promise<TeacherAssignmentRow[]> => {
  const builder = new ParamBuilder();
  const teacherPlaceholder = builder.add(teacherId);
  const conditions = [`cs.teacher_id = ${teacherPlaceholder}`, 'c.deleted_at IS NULL'];

  if (academicYearId !== undefined) {
    conditions.push(`c.academic_year_id = ${builder.add(academicYearId)}`);
  }

  const result = await pool.query<TeacherAssignmentRow>(
    `SELECT cs.id AS class_subject_id,
            c.id AS class_id,
            c.name AS class_name,
            c.code AS class_code,
            c.academic_year_id,
            y.name AS academic_year_name,
            c.grade_level_id,
            g.name_en AS grade_level_name,
            s.id AS subject_id,
            s.name_en AS subject_name,
            (c.homeroom_teacher_id = cs.teacher_id) AS is_homeroom,
            (SELECT COUNT(*)::int FROM enrollments e
              WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS student_count
       FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id
       JOIN academic_years y ON y.id = c.academic_year_id
       JOIN grade_levels g ON g.id = c.grade_level_id
       JOIN subjects s ON s.id = cs.subject_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY y.start_date DESC, g.level_order ASC, c.name ASC, s.name_en ASC`,
    builder.params,
  );

  return result.rows;
};

export const findTeacherSchedule = async (
  teacherId: number,
  academicYearId?: number,
): Promise<TeacherScheduleRow[]> => {
  const builder = new ParamBuilder();
  const conditions = [`s.teacher_id = ${builder.add(teacherId)}`, 's.is_active'];

  if (academicYearId !== undefined) {
    conditions.push(`s.academic_year_id = ${builder.add(academicYearId)}`);
  }

  const result = await pool.query<TeacherScheduleRow>(
    `SELECT s.id, s.day_of_week, s.period_number, s.start_time, s.end_time,
            s.class_id, c.name AS class_name,
            s.subject_id, sub.name_en AS subject_name,
            s.room_id, r.name AS room_name,
            s.academic_year_id
       FROM schedules s
       JOIN classes c ON c.id = s.class_id
       JOIN subjects sub ON sub.id = s.subject_id
       LEFT JOIN rooms r ON r.id = s.room_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        ARRAY_POSITION(ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']::weekday[], s.day_of_week),
        s.start_time ASC`,
    builder.params,
  );

  return result.rows;
};

/** True when the teacher teaches this class, or is its homeroom teacher. */
export const teacherHasClassAccess = async (
  teacherId: number,
  classId: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query<{ has_access: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM class_subjects cs
        WHERE cs.teacher_id = $1 AND cs.class_id = $2 AND cs.is_active
       UNION ALL
       SELECT 1 FROM classes c
        WHERE c.homeroom_teacher_id = $1 AND c.id = $2 AND c.deleted_at IS NULL
     ) AS has_access`,
    [teacherId, classId],
  );

  return result.rows[0]?.has_access ?? false;
};

/** True when the teacher is assigned to teach this specific subject in this class. */
export const teacherTeachesSubject = async (
  teacherId: number,
  classId: number,
  subjectId: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query<{ teaches: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM class_subjects cs
        WHERE cs.teacher_id = $1 AND cs.class_id = $2 AND cs.subject_id = $3 AND cs.is_active
     ) AS teaches`,
    [teacherId, classId, subjectId],
  );

  return result.rows[0]?.teaches ?? false;
};

export const countHomeroomClasses = async (
  teacherId: number,
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM classes c
       JOIN academic_years y ON y.id = c.academic_year_id
      WHERE c.homeroom_teacher_id = $1 AND c.deleted_at IS NULL AND y.status <> 'CLOSED'`,
    [teacherId],
  );

  return result.rows[0]?.count ?? 0;
};
