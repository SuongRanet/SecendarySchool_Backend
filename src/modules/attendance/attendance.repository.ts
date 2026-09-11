import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams } from '../../types';
import { ParamBuilder } from '../../utils/sql';
import type {
  AttendanceEntryInput,
  AttendanceFilters,
  AttendanceReasonRow,
  AttendanceRow,
  ClassAttendanceSummary,
  DailyAttendancePoint,
  StudentAttendanceSummary,
} from './attendance.types';

const BASE_SELECT = `
  SELECT a.*,
         s.student_code,
         s.first_name_en AS student_first_name,
         s.last_name_en AS student_last_name,
         s.profile_photo AS student_photo,
         c.name AS class_name,
         sub.name_en AS subject_name,
         ar.name_en AS reason_name,
         u.username AS recorded_by_name
    FROM attendance a
    JOIN students s ON s.id = a.student_id
    JOIN classes c ON c.id = a.class_id
    LEFT JOIN subjects sub ON sub.id = a.subject_id
    LEFT JOIN attendance_reasons ar ON ar.id = a.reason_id
    LEFT JOIN users u ON u.id = a.recorded_by
`;

const buildConditions = (filters: AttendanceFilters, builder: ParamBuilder): string[] => {
  const conditions: string[] = ['s.deleted_at IS NULL'];

  if (filters.classId !== undefined) {
    conditions.push(`a.class_id = ${builder.add(filters.classId)}`);
  }

  if (filters.studentId !== undefined) {
    conditions.push(`a.student_id = ${builder.add(filters.studentId)}`);
  }

  if (filters.academicYearId !== undefined) {
    conditions.push(`a.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.subjectId !== undefined) {
    conditions.push(`a.subject_id = ${builder.add(filters.subjectId)}`);
  }

  if (filters.status) {
    conditions.push(`a.status = ${builder.add(filters.status)}::attendance_status`);
  }

  if (filters.dateFrom) {
    conditions.push(`a.attendance_date >= ${builder.add(filters.dateFrom)}::date`);
  }

  if (filters.dateTo) {
    conditions.push(`a.attendance_date <= ${builder.add(filters.dateTo)}::date`);
  }

  if (filters.periodNumber !== undefined && filters.periodNumber !== null) {
    conditions.push(`a.period_number = ${builder.add(filters.periodNumber)}`);
  }

  return conditions;
};

export const findAttendance = async (
  filters: AttendanceFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<AttendanceRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM attendance a
       JOIN students s ON s.id = a.student_id
       ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<AttendanceRow>(
    `${BASE_SELECT}
     ${where}
     ORDER BY a.attendance_date DESC, a.period_number NULLS FIRST, s.first_name_en ASC
     LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAttendanceById = async (
  id: number,
  executor: Queryable = pool,
): Promise<AttendanceRow | null> => {
  const result = await executor.query<AttendanceRow>(`${BASE_SELECT} WHERE a.id = $1`, [id]);
  return result.rows[0] ?? null;
};

/** Existing marks for one class, date and period. */
export const findAttendanceForSheet = async (
  classId: number,
  attendanceDate: string,
  periodNumber: number | null,
  executor: Queryable = pool,
): Promise<AttendanceRow[]> => {
  const result = await executor.query<AttendanceRow>(
    `${BASE_SELECT}
      WHERE a.class_id = $1
        AND a.attendance_date = $2::date
        AND (($3::int IS NULL AND a.period_number IS NULL) OR a.period_number = $3::int)`,
    [classId, attendanceDate, periodNumber],
  );

  return result.rows;
};

/**
 * Inserts or updates one student's mark. The unique index on
 * (student, date[, period]) makes the upsert safe when a teacher re-saves a sheet.
 */
export const upsertAttendance = async (
  input: AttendanceEntryInput & {
    classId: number;
    enrollmentId: number | null;
    academicYearId: number;
    attendanceDate: string;
    periodNumber: number | null;
    subjectId: number | null;
    scheduleId: number | null;
    recordedBy: number | null;
  },
  executor: Queryable = pool,
): Promise<number> => {
  const conflictTarget =
    input.periodNumber === null
      ? '(student_id, attendance_date) WHERE period_number IS NULL'
      : '(student_id, attendance_date, period_number) WHERE period_number IS NOT NULL';

  const result = await executor.query<{ id: number }>(
    `INSERT INTO attendance (
        student_id, class_id, enrollment_id, academic_year_id, schedule_id, subject_id,
        attendance_date, period_number, status, reason_id, note, minutes_late, recorded_by
     ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::date, $8, $9::attendance_status, $10, $11, $12, $13
     )
     ON CONFLICT ${conflictTarget} DO UPDATE
       SET status = EXCLUDED.status,
           class_id = EXCLUDED.class_id,
           enrollment_id = EXCLUDED.enrollment_id,
           subject_id = EXCLUDED.subject_id,
           schedule_id = EXCLUDED.schedule_id,
           reason_id = EXCLUDED.reason_id,
           note = EXCLUDED.note,
           minutes_late = EXCLUDED.minutes_late,
           updated_by = EXCLUDED.recorded_by
     RETURNING id`,
    [
      input.studentId,
      input.classId,
      input.enrollmentId,
      input.academicYearId,
      input.scheduleId,
      input.subjectId,
      input.attendanceDate,
      input.periodNumber,
      input.status,
      input.reasonId ?? null,
      input.note ?? null,
      input.minutesLate ?? null,
      input.recordedBy,
    ],
  );

  return result.rows[0].id;
};

export const updateAttendanceRecord = async (
  id: number,
  input: {
    status?: string;
    reasonId?: number | null;
    note?: string | null;
    minutesLate?: number | null;
    updatedBy: number | null;
  },
  executor: Queryable = pool,
): Promise<AttendanceRow | null> => {
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (input.status !== undefined) {
    params.push(input.status);
    assignments.push(`status = $${params.length}::attendance_status`);
  }

  if (input.reasonId !== undefined) {
    params.push(input.reasonId);
    assignments.push(`reason_id = $${params.length}`);
  }

  if (input.note !== undefined) {
    params.push(input.note);
    assignments.push(`note = $${params.length}`);
  }

  if (input.minutesLate !== undefined) {
    params.push(input.minutesLate);
    assignments.push(`minutes_late = $${params.length}`);
  }

  params.push(input.updatedBy);
  assignments.push(`updated_by = $${params.length}`);

  params.push(id);

  await executor.query(
    `UPDATE attendance SET ${assignments.join(', ')} WHERE id = $${params.length}`,
    params,
  );

  return findAttendanceById(id, executor);
};

export const deleteAttendance = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query('DELETE FROM attendance WHERE id = $1', [id]);
  return result.rowCount !== null && result.rowCount > 0;
};

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

const SUMMARY_COLUMNS = `
  COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int AS present,
  COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent,
  COUNT(*) FILTER (WHERE a.status = 'LATE')::int AS late,
  COUNT(*) FILTER (WHERE a.status = 'EXCUSED')::int AS excused,
  COUNT(*) FILTER (WHERE a.status = 'LEAVE')::int AS leave,
  COUNT(*)::int AS "totalRecords"
`;

export const summarizeStudent = async (
  studentId: number,
  filters: { academicYearId?: number; dateFrom?: string; dateTo?: string },
): Promise<Omit<StudentAttendanceSummary, 'attendanceRate'>> => {
  const builder = new ParamBuilder();
  const conditions = [`a.student_id = ${builder.add(studentId)}`];

  if (filters.academicYearId !== undefined) {
    conditions.push(`a.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.dateFrom) {
    conditions.push(`a.attendance_date >= ${builder.add(filters.dateFrom)}::date`);
  }

  if (filters.dateTo) {
    conditions.push(`a.attendance_date <= ${builder.add(filters.dateTo)}::date`);
  }

  const result = await pool.query<Omit<StudentAttendanceSummary, 'attendanceRate'>>(
    `SELECT s.id AS "studentId",
            s.student_code AS "studentCode",
            TRIM(CONCAT(s.first_name_en, ' ', s.last_name_en)) AS "studentName",
            ${SUMMARY_COLUMNS}
       FROM students s
       LEFT JOIN attendance a ON a.student_id = s.id AND ${conditions.join(' AND ')}
      WHERE s.id = ${builder.add(studentId)}
      GROUP BY s.id, s.student_code, s.first_name_en, s.last_name_en`,
    builder.params,
  );

  return (
    result.rows[0] ?? {
      studentId,
      studentCode: '',
      studentName: '',
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      leave: 0,
      totalRecords: 0,
    }
  );
};

export const summarizeClass = async (
  classId: number,
  filters: { dateFrom?: string; dateTo?: string },
): Promise<Omit<ClassAttendanceSummary, 'attendanceRate'>> => {
  const builder = new ParamBuilder();
  const classPlaceholder = builder.add(classId);
  const conditions = [`a.class_id = ${classPlaceholder}`];

  if (filters.dateFrom) {
    conditions.push(`a.attendance_date >= ${builder.add(filters.dateFrom)}::date`);
  }

  if (filters.dateTo) {
    conditions.push(`a.attendance_date <= ${builder.add(filters.dateTo)}::date`);
  }

  const result = await pool.query<Omit<ClassAttendanceSummary, 'attendanceRate'>>(
    `SELECT c.id AS "classId",
            c.name AS "className",
            (SELECT COUNT(*)::int FROM enrollments e
              WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS "studentCount",
            ${SUMMARY_COLUMNS}
       FROM classes c
       LEFT JOIN attendance a ON ${conditions.join(' AND ')}
      WHERE c.id = ${classPlaceholder}
      GROUP BY c.id, c.name`,
    builder.params,
  );

  return (
    result.rows[0] ?? {
      classId,
      className: '',
      studentCount: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      leave: 0,
      totalRecords: 0,
    }
  );
};

export const summarizeClassStudents = async (
  classId: number,
  filters: { dateFrom?: string; dateTo?: string },
): Promise<Omit<StudentAttendanceSummary, 'attendanceRate'>[]> => {
  const builder = new ParamBuilder();
  const classPlaceholder = builder.add(classId);
  const conditions = [`a.student_id = s.id`, `a.class_id = ${classPlaceholder}`];

  if (filters.dateFrom) {
    conditions.push(`a.attendance_date >= ${builder.add(filters.dateFrom)}::date`);
  }

  if (filters.dateTo) {
    conditions.push(`a.attendance_date <= ${builder.add(filters.dateTo)}::date`);
  }

  const result = await pool.query<Omit<StudentAttendanceSummary, 'attendanceRate'>>(
    `SELECT s.id AS "studentId",
            s.student_code AS "studentCode",
            TRIM(CONCAT(s.first_name_en, ' ', s.last_name_en)) AS "studentName",
            ${SUMMARY_COLUMNS}
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN attendance a ON ${conditions.join(' AND ')}
      WHERE e.class_id = ${classPlaceholder} AND e.status = 'ACTIVE' AND s.deleted_at IS NULL
      GROUP BY s.id, s.student_code, s.first_name_en, s.last_name_en
      ORDER BY s.first_name_en ASC`,
    builder.params,
  );

  return result.rows;
};

export const dailyTrend = async (filters: {
  academicYearId: number;
  classId?: number;
  dateFrom: string;
  dateTo: string;
}): Promise<DailyAttendancePoint[]> => {
  const builder = new ParamBuilder();
  const conditions = [
    `a.academic_year_id = ${builder.add(filters.academicYearId)}`,
    `a.attendance_date >= ${builder.add(filters.dateFrom)}::date`,
    `a.attendance_date <= ${builder.add(filters.dateTo)}::date`,
  ];

  if (filters.classId !== undefined) {
    conditions.push(`a.class_id = ${builder.add(filters.classId)}`);
  }

  const result = await pool.query<DailyAttendancePoint>(
    `SELECT a.attendance_date::text AS date,
            COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int AS present,
            COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent,
            COUNT(*) FILTER (WHERE a.status = 'LATE')::int AS late,
            COUNT(*) FILTER (WHERE a.status = 'EXCUSED')::int AS excused,
            COUNT(*) FILTER (WHERE a.status = 'LEAVE')::int AS leave
       FROM attendance a
      WHERE ${conditions.join(' AND ')}
      GROUP BY a.attendance_date
      ORDER BY a.attendance_date ASC`,
    builder.params,
  );

  return result.rows;
};

/**
 * One day's school-wide totals, used by the administrator dashboard.
 *
 * The day is a parameter rather than `CURRENT_DATE` because a register is taken
 * during the morning: before it is, "today" is legitimately empty, and a
 * dashboard that can only ever show today then reads as though the school had
 * vanished. Being able to step back a day distinguishes "not taken yet" from
 * "nobody came".
 */
export const dayOverview = async (
  academicYearId: number,
  attendanceDate: string | null,
): Promise<{
  present: number; absent: number; late: number; excused: number; leave: number;
  expected: number; date: string;
}> => {
  const result = await pool.query<{
    present: number;
    absent: number;
    late: number;
    excused: number;
    leave: number;
    expected: number;
    date: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int AS present,
       COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent,
       COUNT(*) FILTER (WHERE a.status = 'LATE')::int AS late,
       COUNT(*) FILTER (WHERE a.status = 'EXCUSED')::int AS excused,
       COUNT(*) FILTER (WHERE a.status = 'LEAVE')::int AS leave,
       (SELECT COUNT(*)::int FROM enrollments e
         WHERE e.academic_year_id = $1 AND e.status = 'ACTIVE') AS expected,
       /*
        * The day resolved by the database, not by Node.
        *
        * Defaulting in JavaScript used toISOString, which is UTC: from five in
        * the evening Cambodian time onwards that is yesterday, so a register
        * taken in the evening was reported against the wrong day. CURRENT_DATE
        * is the school's own day, and it is echoed back so the caller can label
        * the figures with the day they actually describe.
        */
       COALESCE($2::date, CURRENT_DATE)::text AS date
     FROM attendance a
     WHERE a.academic_year_id = $1
       AND a.attendance_date = COALESCE($2::date, CURRENT_DATE)`,
    [academicYearId, attendanceDate],
  );

  return (
    result.rows[0] ?? {
      present: 0, absent: 0, late: 0, excused: 0, leave: 0, expected: 0, date: '',
    }
  );
};

/** Classes that still have no attendance recorded for a date. */
export const findClassesMissingAttendance = async (
  academicYearId: number,
  attendanceDate: string,
  teacherId?: number,
): Promise<{ classId: number; className: string; studentCount: number }[]> => {
  const builder = new ParamBuilder();
  const yearPlaceholder = builder.add(academicYearId);
  const datePlaceholder = builder.add(attendanceDate);
  const conditions = [
    `c.academic_year_id = ${yearPlaceholder}`,
    'c.deleted_at IS NULL',
    'c.is_active',
    `NOT EXISTS (SELECT 1 FROM attendance a
                  WHERE a.class_id = c.id AND a.attendance_date = ${datePlaceholder}::date)`,
  ];

  if (teacherId !== undefined) {
    const teacherPlaceholder = builder.add(teacherId);
    conditions.push(
      `(c.homeroom_teacher_id = ${teacherPlaceholder}
        OR EXISTS (SELECT 1 FROM class_subjects cs
                    WHERE cs.class_id = c.id AND cs.teacher_id = ${teacherPlaceholder} AND cs.is_active))`,
    );
  }

  const result = await pool.query<{ classId: number; className: string; studentCount: number }>(
    `SELECT c.id AS "classId",
            c.name AS "className",
            (SELECT COUNT(*)::int FROM enrollments e
              WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS "studentCount"
       FROM classes c
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.name ASC`,
    builder.params,
  );

  return result.rows;
};

// ---------------------------------------------------------------------------
// Reasons
// ---------------------------------------------------------------------------

export const findReasons = async (activeOnly = true): Promise<AttendanceReasonRow[]> => {
  const result = await pool.query<AttendanceReasonRow>(
    `SELECT id, code, name_en, name_kh, applies_to, is_excused, is_active
       FROM attendance_reasons
      WHERE ($1::boolean = FALSE OR is_active)
      ORDER BY name_en ASC`,
    [activeOnly],
  );

  return result.rows;
};

export const findReasonById = async (
  id: number,
  executor: Queryable = pool,
): Promise<AttendanceReasonRow | null> => {
  const result = await executor.query<AttendanceReasonRow>(
    'SELECT id, code, name_en, name_kh, applies_to, is_excused, is_active FROM attendance_reasons WHERE id = $1',
    [id],
  );

  return result.rows[0] ?? null;
};
