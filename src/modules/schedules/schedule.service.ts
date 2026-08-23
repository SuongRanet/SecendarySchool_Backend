import { withTransaction } from '../../database/connection';
import type { AuditContext, Weekday } from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as academicYearService from '../academic-years/academic-year.service';
import * as classRepository from '../classes/class.repository';
import * as roomRepository from '../rooms/room.repository';
import * as teacherRepository from '../teachers/teacher.repository';
import * as repository from './schedule.repository';
import type {
  CreateScheduleInput,
  ScheduleConflict,
  ScheduleDto,
  ScheduleFilters,
  ScheduleRow,
  UpdateScheduleInput,
} from './schedule.types';

const toDto = (row: ScheduleRow): ScheduleDto => ({
  id: row.id,
  academicYearId: row.academic_year_id,
  academicYearName: row.academic_year_name ?? '',
  classId: row.class_id,
  className: row.class_name ?? '',
  classCode: row.class_code ?? '',
  gradeLevelName: row.grade_level_name ?? '',
  subjectId: row.subject_id,
  subjectName: row.subject_name ?? '',
  subjectCode: row.subject_code ?? '',
  teacherId: row.teacher_id,
  teacherName: row.teacher_name ?? null,
  roomId: row.room_id,
  roomName: row.room_name ?? null,
  dayOfWeek: row.day_of_week,
  periodNumber: row.period_number,
  startTime: row.start_time,
  endTime: row.end_time,
  effectiveFrom: row.effective_from,
  effectiveTo: row.effective_to,
  notes: row.notes,
  isActive: row.is_active,
});

const CONFLICT_MESSAGES: Record<ScheduleConflict['kind'], (row: ScheduleRow) => string> = {
  TEACHER: (row) =>
    `${row.teacher_name ?? 'This teacher'} already teaches ${row.subject_name} to ${row.class_name} at ${row.start_time}–${row.end_time}`,
  CLASS: (row) =>
    `${row.class_name} already has ${row.subject_name} at ${row.start_time}–${row.end_time}`,
  ROOM: (row) =>
    `${row.room_name ?? 'This room'} is already used by ${row.class_name} at ${row.start_time}–${row.end_time}`,
};

const toConflict = (row: ScheduleRow & { conflict_kind: ScheduleConflict['kind'] }): ScheduleConflict => ({
  kind: row.conflict_kind,
  scheduleId: row.id,
  dayOfWeek: row.day_of_week,
  startTime: row.start_time,
  endTime: row.end_time,
  className: row.class_name ?? '',
  subjectName: row.subject_name ?? '',
  teacherName: row.teacher_name ?? null,
  roomName: row.room_name ?? null,
  message: CONFLICT_MESSAGES[row.conflict_kind](row),
});

const assertTimeOrder = (startTime: string, endTime: string): void => {
  if (endTime <= startTime) {
    throw AppError.validation('Validation failed', [
      { field: 'endTime', message: 'The end time must be after the start time' },
    ]);
  }
};

/**
 * Detects teacher, class and room double-booking for a proposed slot. Conflicts
 * are always evaluated on the server — this is the rule that keeps a timetable
 * usable, so it can never be skipped by the client.
 */
/**
 * Splits detected clashes into the ones that must stop the write and the ones a
 * user may accept. A teacher cannot be in two rooms at once and a class cannot
 * sit two lessons at once, so those are hard errors. A room clash is a warning:
 * two groups deliberately sharing a hall is a real timetable, and the caller can
 * confirm it with `ignoreWarnings`.
 */
export const classifyConflicts = (
  conflicts: ScheduleConflict[],
): { blocking: ScheduleConflict[]; warnings: ScheduleConflict[] } => ({
  blocking: conflicts.filter((conflict) => conflict.kind !== 'ROOM'),
  warnings: conflicts.filter((conflict) => conflict.kind === 'ROOM'),
});

export const detectConflicts = async (
  input: {
    academicYearId: number;
    classId: number;
    dayOfWeek: Weekday;
    startTime: string;
    endTime: string;
    teacherId?: number | null;
    roomId?: number | null;
    excludeScheduleId?: number;
  },
): Promise<ScheduleConflict[]> => {
  assertTimeOrder(input.startTime, input.endTime);

  const rows = await repository.findConflicts({
    academicYearId: input.academicYearId,
    classId: input.classId,
    teacherId: input.teacherId ?? null,
    roomId: input.roomId ?? null,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    excludeScheduleId: input.excludeScheduleId,
  });

  return rows.map(toConflict);
};

export const list = async (filters: ScheduleFilters): Promise<ScheduleDto[]> => {
  const rows = await repository.findSchedules(filters);
  return rows.map(toDto);
};

export const getById = async (id: number): Promise<ScheduleDto> => {
  const row = await repository.findScheduleById(id);

  if (!row) {
    throw AppError.notFound('Schedule entry not found', 'SCHEDULE_NOT_FOUND');
  }

  return toDto(row);
};

const resolveContext = async (
  classId: number,
): Promise<{ academicYearId: number; className: string }> => {
  const classRow = await classRepository.findClassById(classId);

  if (!classRow) {
    throw AppError.badRequest('The selected class does not exist', 'CLASS_NOT_FOUND');
  }

  if (classRow.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'The academic year of this class is closed',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  return { academicYearId: classRow.academic_year_id, className: classRow.name };
};

const assertReferences = async (input: {
  classId: number;
  subjectId: number;
  teacherId?: number | null;
  roomId?: number | null;
}): Promise<void> => {
  const classSubjects = await classRepository.findClassSubjects(input.classId);
  const offered = classSubjects.some((item) => item.subject_id === input.subjectId);

  if (!offered) {
    throw AppError.badRequest(
      'This subject is not assigned to the selected class. Add it to the class first.',
      'SUBJECT_NOT_IN_CLASS',
    );
  }

  if (input.teacherId) {
    const teacher = await teacherRepository.findTeacherById(input.teacherId);

    if (!teacher) {
      throw AppError.badRequest('The selected teacher does not exist', 'TEACHER_NOT_FOUND');
    }
  }

  if (input.roomId) {
    const room = await roomRepository.findRoomById(input.roomId);

    if (!room) {
      throw AppError.badRequest('The selected room does not exist', 'ROOM_NOT_FOUND');
    }
  }
};

export const create = async (
  input: CreateScheduleInput,
  context: AuditContext,
): Promise<{ schedule: ScheduleDto; conflicts: ScheduleConflict[] }> => {
  assertTimeOrder(input.startTime, input.endTime);

  const { academicYearId, className } = await resolveContext(input.classId);
  await assertReferences(input);

  const conflicts = await detectConflicts({
    academicYearId,
    classId: input.classId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    teacherId: input.teacherId,
    roomId: input.roomId,
  });

  const { blocking, warnings } = classifyConflicts(conflicts);

  if (blocking.length > 0) {
    throw AppError.conflict(blocking[0].message, 'SCHEDULE_CONFLICT', {
      conflicts: blocking as unknown as Record<string, unknown>[],
    });
  }

  if (warnings.length > 0 && !input.ignoreWarnings) {
    throw AppError.conflict(warnings[0].message, 'SCHEDULE_ROOM_CONFLICT', {
      conflicts: warnings as unknown as Record<string, unknown>[],
      warning: true,
    });
  }

  const created = await withTransaction(async (client) => {
    const row = await repository.insertSchedule({ ...input, academicYearId }, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'schedule',
        entityId: row.id,
        description: `Added ${row.subject_name} to the timetable of ${className} on ${input.dayOfWeek}`,
        newValue: {
          classId: input.classId,
          subjectId: input.subjectId,
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  return { schedule: toDto(created), conflicts };
};

export const update = async (
  id: number,
  input: UpdateScheduleInput,
  context: AuditContext,
): Promise<{ schedule: ScheduleDto; conflicts: ScheduleConflict[] }> => {
  const existing = await repository.findScheduleById(id);

  if (!existing) {
    throw AppError.notFound('Schedule entry not found', 'SCHEDULE_NOT_FOUND');
  }

  if (existing.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'This schedule belongs to a closed academic year and cannot be modified',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  const classId = input.classId ?? existing.class_id;
  const subjectId = input.subjectId ?? existing.subject_id;
  const startTime = input.startTime ?? existing.start_time;
  const endTime = input.endTime ?? existing.end_time;
  const dayOfWeek = input.dayOfWeek ?? existing.day_of_week;
  const teacherId = input.teacherId === undefined ? existing.teacher_id : input.teacherId;
  const roomId = input.roomId === undefined ? existing.room_id : input.roomId;

  assertTimeOrder(startTime, endTime);

  const { academicYearId } = await resolveContext(classId);
  await assertReferences({ classId, subjectId, teacherId, roomId });

  const conflicts = await detectConflicts({
    academicYearId,
    classId,
    dayOfWeek,
    startTime,
    endTime,
    teacherId,
    roomId,
    excludeScheduleId: id,
  });

  const { blocking, warnings } = classifyConflicts(conflicts);

  if (blocking.length > 0) {
    throw AppError.conflict(blocking[0].message, 'SCHEDULE_CONFLICT', {
      conflicts: blocking as unknown as Record<string, unknown>[],
    });
  }

  if (warnings.length > 0 && !input.ignoreWarnings) {
    throw AppError.conflict(warnings[0].message, 'SCHEDULE_ROOM_CONFLICT', {
      conflicts: warnings as unknown as Record<string, unknown>[],
      warning: true,
    });
  }

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateSchedule(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'schedule',
        entityId: id,
        description: `Updated the timetable entry for ${existing.class_name}`,
        oldValue: {
          dayOfWeek: existing.day_of_week,
          startTime: existing.start_time,
          endTime: existing.end_time,
          teacherId: existing.teacher_id,
          roomId: existing.room_id,
        },
        newValue: { dayOfWeek, startTime, endTime, teacherId, roomId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (!updated) {
    throw AppError.notFound('Schedule entry not found', 'SCHEDULE_NOT_FOUND');
  }

  return { schedule: toDto(updated), conflicts };
};

export const remove = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findScheduleById(id);

  if (!existing) {
    throw AppError.notFound('Schedule entry not found', 'SCHEDULE_NOT_FOUND');
  }

  if (existing.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'This schedule belongs to a closed academic year and cannot be modified',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  await withTransaction(async (client) => {
    await repository.deleteSchedule(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'DELETE',
        entityType: 'schedule',
        entityId: id,
        description: `Removed ${existing.subject_name} from the timetable of ${existing.class_name}`,
        oldValue: {
          dayOfWeek: existing.day_of_week,
          startTime: existing.start_time,
          endTime: existing.end_time,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

const WEEKDAY_BY_INDEX: Weekday[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export const weekdayOf = (date: Date = new Date()): Weekday => WEEKDAY_BY_INDEX[date.getDay()];

export const listForToday = async (filters: {
  teacherId?: number;
  classId?: number;
}): Promise<ScheduleDto[]> => {
  const year = await academicYearService.requireActiveYear();

  const rows = await repository.findScheduleForDay(weekdayOf(), {
    academicYearId: year.id,
    ...filters,
  });

  return rows.map(toDto);
};
