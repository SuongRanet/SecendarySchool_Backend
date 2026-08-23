import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { Weekday } from '../../types';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  ConflictKind,
  CreateScheduleInput,
  ScheduleFilters,
  ScheduleRow,
  UpdateScheduleInput,
} from './schedule.types';

const BASE_SELECT = `
  SELECT s.*,
         c.name AS class_name,
         c.code AS class_code,
         g.name_en AS grade_level_name,
         sub.name_en AS subject_name,
         sub.code AS subject_code,
         NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), '') AS teacher_name,
         r.name AS room_name,
         y.name AS academic_year_name,
         y.status::text AS academic_year_status
    FROM schedules s
    JOIN classes c ON c.id = s.class_id
    JOIN grade_levels g ON g.id = c.grade_level_id
    JOIN subjects sub ON sub.id = s.subject_id
    JOIN academic_years y ON y.id = s.academic_year_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    LEFT JOIN rooms r ON r.id = s.room_id
`;

const DAY_ORDER = `
  ARRAY_POSITION(
    ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']::weekday[],
    s.day_of_week
  )
`;

export const findSchedules = async (filters: ScheduleFilters): Promise<ScheduleRow[]> => {
  const builder = new ParamBuilder();
  const conditions: string[] = ['c.deleted_at IS NULL'];

  if (filters.academicYearId !== undefined) {
    conditions.push(`s.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.classId !== undefined) {
    conditions.push(`s.class_id = ${builder.add(filters.classId)}`);
  }

  if (filters.teacherId !== undefined) {
    conditions.push(`s.teacher_id = ${builder.add(filters.teacherId)}`);
  }

  if (filters.roomId !== undefined) {
    conditions.push(`s.room_id = ${builder.add(filters.roomId)}`);
  }

  if (filters.subjectId !== undefined) {
    conditions.push(`s.subject_id = ${builder.add(filters.subjectId)}`);
  }

  if (filters.dayOfWeek) {
    conditions.push(`s.day_of_week = ${builder.add(filters.dayOfWeek)}::weekday`);
  }

  if (filters.isActive !== undefined) {
    conditions.push(`s.is_active = ${builder.add(filters.isActive)}`);
  }

  // A student's timetable is the timetable of the class they are enrolled in.
  if (filters.studentId !== undefined) {
    conditions.push(
      `s.class_id IN (SELECT e.class_id FROM enrollments e
                       WHERE e.student_id = ${builder.add(filters.studentId)}
                         AND e.status = 'ACTIVE')`,
    );
  }

  const result = await pool.query<ScheduleRow>(
    `${BASE_SELECT}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${DAY_ORDER}, s.start_time ASC`,
    builder.params,
  );

  return result.rows;
};

export const findScheduleById = async (
  id: number,
  executor: Queryable = pool,
): Promise<ScheduleRow | null> => {
  const result = await executor.query<ScheduleRow>(`${BASE_SELECT} WHERE s.id = $1`, [id]);
  return result.rows[0] ?? null;
};

interface ConflictQueryInput {
  academicYearId: number;
  dayOfWeek: Weekday;
  startTime: string;
  endTime: string;
  classId?: number | null;
  teacherId?: number | null;
  roomId?: number | null;
  excludeScheduleId?: number;
}

/**
 * Finds every active schedule entry whose time range overlaps the given slot for
 * the same teacher, class or room. Two ranges overlap when
 * `existing.start < new.end AND existing.end > new.start`.
 */
export const findConflicts = async (
  input: ConflictQueryInput,
  executor: Queryable = pool,
): Promise<(ScheduleRow & { conflict_kind: ConflictKind })[]> => {
  const builder = new ParamBuilder();
  const targets: string[] = [];

  if (input.classId) {
    targets.push(`s.class_id = ${builder.add(input.classId)}`);
  }

  if (input.teacherId) {
    targets.push(`s.teacher_id = ${builder.add(input.teacherId)}`);
  }

  if (input.roomId) {
    targets.push(`s.room_id = ${builder.add(input.roomId)}`);
  }

  if (targets.length === 0) {
    return [];
  }

  const classIdParam = input.classId ? builder.add(input.classId) : 'NULL';
  const teacherIdParam = input.teacherId ? builder.add(input.teacherId) : 'NULL';
  const roomIdParam = input.roomId ? builder.add(input.roomId) : 'NULL';

  const conditions = [
    `s.academic_year_id = ${builder.add(input.academicYearId)}`,
    `s.day_of_week = ${builder.add(input.dayOfWeek)}::weekday`,
    's.is_active',
    'c.deleted_at IS NULL',
    `s.start_time < ${builder.add(input.endTime)}::time`,
    `s.end_time > ${builder.add(input.startTime)}::time`,
    `(${targets.join(' OR ')})`,
  ];

  if (input.excludeScheduleId !== undefined) {
    conditions.push(`s.id <> ${builder.add(input.excludeScheduleId)}`);
  }

  const result = await executor.query<ScheduleRow & { conflict_kind: ConflictKind }>(
    `SELECT s.*,
            c.name AS class_name,
            c.code AS class_code,
            g.name_en AS grade_level_name,
            sub.name_en AS subject_name,
            sub.code AS subject_code,
            NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), '') AS teacher_name,
            r.name AS room_name,
            y.name AS academic_year_name,
            y.status::text AS academic_year_status,
            CASE
              WHEN s.teacher_id IS NOT NULL AND s.teacher_id = ${teacherIdParam} THEN 'TEACHER'
              WHEN s.class_id = ${classIdParam} THEN 'CLASS'
              WHEN s.room_id IS NOT NULL AND s.room_id = ${roomIdParam} THEN 'ROOM'
              ELSE 'CLASS'
            END AS conflict_kind
       FROM schedules s
       JOIN classes c ON c.id = s.class_id
       JOIN grade_levels g ON g.id = c.grade_level_id
       JOIN subjects sub ON sub.id = s.subject_id
       JOIN academic_years y ON y.id = s.academic_year_id
       LEFT JOIN teachers t ON t.id = s.teacher_id
       LEFT JOIN rooms r ON r.id = s.room_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.start_time ASC`,
    builder.params,
  );

  return result.rows;
};

export const insertSchedule = async (
  input: CreateScheduleInput & { academicYearId: number },
  executor: Queryable = pool,
): Promise<ScheduleRow> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO schedules (
        academic_year_id, class_id, subject_id, teacher_id, room_id,
        day_of_week, period_number, start_time, end_time,
        effective_from, effective_to, notes, is_active
     ) VALUES (
        $1, $2, $3, $4, $5,
        $6::weekday, $7, $8::time, $9::time,
        $10::date, $11::date, $12, COALESCE($13, TRUE)
     )
     RETURNING id`,
    [
      input.academicYearId,
      input.classId,
      input.subjectId,
      input.teacherId ?? null,
      input.roomId ?? null,
      input.dayOfWeek,
      input.periodNumber ?? null,
      input.startTime,
      input.endTime,
      input.effectiveFrom ?? null,
      input.effectiveTo ?? null,
      input.notes ?? null,
      input.isActive ?? null,
    ],
  );

  return (await findScheduleById(result.rows[0].id, executor)) as ScheduleRow;
};

export const updateSchedule = async (
  id: number,
  input: UpdateScheduleInput,
  executor: Queryable = pool,
): Promise<ScheduleRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    classId: { column: 'class_id' },
    subjectId: { column: 'subject_id' },
    teacherId: { column: 'teacher_id' },
    roomId: { column: 'room_id' },
    dayOfWeek: { column: 'day_of_week', cast: 'weekday' },
    periodNumber: { column: 'period_number' },
    startTime: { column: 'start_time', cast: 'time' },
    endTime: { column: 'end_time', cast: 'time' },
    effectiveFrom: { column: 'effective_from', cast: 'date' },
    effectiveTo: { column: 'effective_to', cast: 'date' },
    notes: { column: 'notes' },
    isActive: { column: 'is_active' },
  });

  if (assignments.length === 0) {
    return findScheduleById(id, executor);
  }

  params.push(id);

  await executor.query(
    `UPDATE schedules SET ${assignments.join(', ')} WHERE id = $${params.length}`,
    params,
  );

  return findScheduleById(id, executor);
};

export const deleteSchedule = async (id: number, executor: Queryable = pool): Promise<boolean> => {
  const result = await executor.query('DELETE FROM schedules WHERE id = $1', [id]);
  return result.rowCount !== null && result.rowCount > 0;
};

/** Today's timetable for a class, used by the teacher dashboard. */
export const findScheduleForDay = async (
  dayOfWeek: Weekday,
  filters: { academicYearId: number; teacherId?: number; classId?: number },
): Promise<ScheduleRow[]> => {
  const builder = new ParamBuilder();
  const conditions = [
    `s.academic_year_id = ${builder.add(filters.academicYearId)}`,
    `s.day_of_week = ${builder.add(dayOfWeek)}::weekday`,
    's.is_active',
    'c.deleted_at IS NULL',
  ];

  if (filters.teacherId !== undefined) {
    conditions.push(`s.teacher_id = ${builder.add(filters.teacherId)}`);
  }

  if (filters.classId !== undefined) {
    conditions.push(`s.class_id = ${builder.add(filters.classId)}`);
  }

  const result = await pool.query<ScheduleRow>(
    `${BASE_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY s.start_time ASC`,
    builder.params,
  );

  return result.rows;
};
