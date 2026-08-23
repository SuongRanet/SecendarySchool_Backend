import { withTransaction } from '../../database/connection';
import type { AuditContext, AuthenticatedUser, PaginatedResult, PaginationParams } from '../../types';
import { AppError } from '../../utils/app-error';
import { hasPermission, isElevated } from '../../middleware/role.middleware';
import { PERMISSIONS } from '../../config/permissions';
import * as auditService from '../audit/audit.service';
import * as classRepository from '../classes/class.repository';
import * as enrollmentRepository from '../enrollments/enrollment.repository';
import * as teacherRepository from '../teachers/teacher.repository';
import * as repository from './attendance.repository';
import type {
  AttendanceDto,
  AttendanceFilters,
  AttendanceReasonDto,
  AttendanceReasonRow,
  AttendanceRow,
  AttendanceSheet,
  AttendanceSummary,
  ClassAttendanceSummary,
  DailyAttendancePoint,
  RecordAttendanceInput,
  StudentAttendanceSummary,
} from './attendance.types';

const toDto = (row: AttendanceRow): AttendanceDto => ({
  id: row.id,
  studentId: row.student_id,
  studentCode: row.student_code ?? '',
  studentName: `${row.student_first_name ?? ''} ${row.student_last_name ?? ''}`.trim(),
  studentPhoto: row.student_photo ?? null,
  classId: row.class_id,
  className: row.class_name ?? '',
  academicYearId: row.academic_year_id,
  subjectId: row.subject_id,
  subjectName: row.subject_name ?? null,
  attendanceDate: row.attendance_date,
  periodNumber: row.period_number,
  status: row.status,
  reasonId: row.reason_id,
  reasonName: row.reason_name ?? null,
  note: row.note,
  minutesLate: row.minutes_late,
  recordedBy: row.recorded_by,
  recordedByName: row.recorded_by_name ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toReasonDto = (row: AttendanceReasonRow): AttendanceReasonDto => ({
  id: row.id,
  code: row.code,
  nameEn: row.name_en,
  nameKh: row.name_kh,
  appliesTo: row.applies_to,
  isExcused: row.is_excused,
  isActive: row.is_active,
});

/**
 * The share of recorded days a student was actually in class, as a percentage
 * rounded to two decimals. A late arrival still counts as attending — the pupil
 * was present — so lateness is reported separately rather than being punished
 * twice. A student with no records yet scores 0 rather than dividing by zero.
 */
export const calculateAttendanceRate = (counts: {
  present: number;
  late: number;
  totalRecords: number;
}): number =>
  counts.totalRecords > 0
    ? Number((((counts.present + counts.late) / counts.totalRecords) * 100).toFixed(2))
    : 0;

const withRate = <T extends { present: number; late: number; totalRecords: number }>(
  summary: T,
): T & { attendanceRate: number } => ({
  ...summary,
  attendanceRate: calculateAttendanceRate(summary),
});

/**
 * A teacher may only record or edit attendance for a class they teach or lead.
 * `attendance.update_any` (homeroom teachers, administrators) lifts the restriction.
 */
export const assertCanRecordForClass = async (
  user: AuthenticatedUser,
  classId: number,
): Promise<void> => {
  if (isElevated(user) || hasPermission(user, PERMISSIONS.ATTENDANCE_UPDATE_ANY)) {
    return;
  }

  if (!user.teacherId) {
    throw AppError.forbidden(
      'Only a teacher assigned to this class can record its attendance',
      'ATTENDANCE_ACCESS_DENIED',
    );
  }

  const hasAccess = await teacherRepository.teacherHasClassAccess(user.teacherId, classId);

  if (!hasAccess) {
    throw AppError.forbidden(
      'You are not assigned to this class',
      'ATTENDANCE_ACCESS_DENIED',
    );
  }
};

export const list = async (
  filters: AttendanceFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<AttendanceDto>> => {
  const result = await repository.findAttendance(filters, pagination);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const getById = async (id: number): Promise<AttendanceDto> => {
  const row = await repository.findAttendanceById(id);

  if (!row) {
    throw AppError.notFound('Attendance record not found', 'ATTENDANCE_NOT_FOUND');
  }

  return toDto(row);
};

/**
 * Builds the sheet a teacher fills in: every actively enrolled student of the
 * class, pre-filled with whatever has already been recorded for that date.
 */
export const getSheet = async (
  classId: number,
  attendanceDate: string,
  periodNumber: number | null,
): Promise<AttendanceSheet> => {
  const classRow = await classRepository.findClassById(classId);

  if (!classRow) {
    throw AppError.notFound('Class not found', 'CLASS_NOT_FOUND');
  }

  const students = await classRepository.findClassStudents(classId);
  const existing = await repository.findAttendanceForSheet(classId, attendanceDate, periodNumber);
  const byStudent = new Map(existing.map((row) => [row.student_id, row]));

  return {
    classId,
    className: classRow.name,
    academicYearId: classRow.academic_year_id,
    attendanceDate,
    periodNumber,
    isRecorded: existing.length > 0,
    recordedAt: existing[0]?.created_at ?? null,
    students: students.map((student) => {
      const record = byStudent.get(student.student_id);

      return {
        studentId: student.student_id,
        studentCode: student.student_code,
        fullName: `${student.first_name_en} ${student.last_name_en}`.trim(),
        fullNameKh:
          student.first_name_kh || student.last_name_kh
            ? `${student.first_name_kh ?? ''} ${student.last_name_kh ?? ''}`.trim()
            : null,
        profilePhoto: student.profile_photo,
        rollNumber: student.roll_number,
        enrollmentId: student.enrollment_id,
        attendance: record
          ? {
              id: record.id,
              status: record.status,
              reasonId: record.reason_id,
              note: record.note,
              minutesLate: record.minutes_late,
            }
          : null,
      };
    }),
  };
};

/**
 * Saves a whole attendance sheet in one transaction. Re-saving the same date
 * updates the existing rows instead of creating duplicates.
 */
export const record = async (
  input: RecordAttendanceInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<AttendanceDto[]> => {
  await assertCanRecordForClass(user, input.classId);

  const classRow = await classRepository.findClassById(input.classId);

  if (!classRow) {
    throw AppError.notFound('Class not found', 'CLASS_NOT_FOUND');
  }

  if (classRow.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'The academic year of this class is closed',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  if (new Date(input.attendanceDate).getTime() > Date.now()) {
    throw AppError.badRequest(
      'Attendance cannot be recorded for a future date',
      'FUTURE_ATTENDANCE_DATE',
    );
  }

  const enrolled = await enrollmentRepository.findActiveEnrollmentsByClass(input.classId);
  const enrollmentByStudent = new Map(enrolled.map((row) => [row.student_id, row.id]));

  for (const entry of input.entries) {
    if (!enrollmentByStudent.has(entry.studentId)) {
      throw AppError.badRequest(
        `Student ${entry.studentId} is not actively enrolled in this class`,
        'STUDENT_NOT_IN_CLASS',
      );
    }
  }

  const ids = await withTransaction(async (client) => {
    const savedIds: number[] = [];

    for (const entry of input.entries) {
      const id = await repository.upsertAttendance(
        {
          ...entry,
          classId: input.classId,
          enrollmentId: enrollmentByStudent.get(entry.studentId) ?? null,
          academicYearId: classRow.academic_year_id,
          attendanceDate: input.attendanceDate,
          periodNumber: input.periodNumber ?? null,
          subjectId: input.subjectId ?? null,
          scheduleId: input.scheduleId ?? null,
          recordedBy: context.userId,
        },
        client,
      );

      savedIds.push(id);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'attendance',
        entityId: input.classId,
        description: `Recorded attendance for ${classRow.name} on ${input.attendanceDate}`,
        newValue: {
          classId: input.classId,
          attendanceDate: input.attendanceDate,
          periodNumber: input.periodNumber ?? null,
          entries: input.entries.length,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return savedIds;
  });

  const saved = await Promise.all(ids.map((id) => repository.findAttendanceById(id)));

  return saved.filter((row): row is AttendanceRow => row !== null).map(toDto);
};

export const updateRecord = async (
  id: number,
  input: {
    status?: string;
    reasonId?: number | null;
    note?: string | null;
    minutesLate?: number | null;
  },
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<AttendanceDto> => {
  const existing = await repository.findAttendanceById(id);

  if (!existing) {
    throw AppError.notFound('Attendance record not found', 'ATTENDANCE_NOT_FOUND');
  }

  await assertCanRecordForClass(user, existing.class_id);

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateAttendanceRecord(
      id,
      { ...input, updatedBy: context.userId },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'attendance',
        entityId: id,
        description: `Updated the attendance of ${existing.student_first_name} ${existing.student_last_name} on ${existing.attendance_date}`,
        oldValue: {
          status: existing.status,
          reasonId: existing.reason_id,
          note: existing.note,
        },
        newValue: input as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (!updated) {
    throw AppError.notFound('Attendance record not found', 'ATTENDANCE_NOT_FOUND');
  }

  return toDto(updated);
};

export const removeRecord = async (
  id: number,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<void> => {
  const existing = await repository.findAttendanceById(id);

  if (!existing) {
    throw AppError.notFound('Attendance record not found', 'ATTENDANCE_NOT_FOUND');
  }

  await assertCanRecordForClass(user, existing.class_id);

  await withTransaction(async (client) => {
    await repository.deleteAttendance(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'DELETE',
        entityType: 'attendance',
        entityId: id,
        description: `Deleted the attendance of ${existing.student_first_name} ${existing.student_last_name} on ${existing.attendance_date}`,
        oldValue: { status: existing.status, attendanceDate: existing.attendance_date },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const summarizeStudent = async (
  studentId: number,
  filters: { academicYearId?: number; dateFrom?: string; dateTo?: string },
): Promise<StudentAttendanceSummary> =>
  withRate(await repository.summarizeStudent(studentId, filters));

export const summarizeClass = async (
  classId: number,
  filters: { dateFrom?: string; dateTo?: string },
): Promise<ClassAttendanceSummary> => withRate(await repository.summarizeClass(classId, filters));

export const summarizeClassStudents = async (
  classId: number,
  filters: { dateFrom?: string; dateTo?: string },
): Promise<StudentAttendanceSummary[]> => {
  const rows = await repository.summarizeClassStudents(classId, filters);
  return rows.map(withRate);
};

export const dailyTrend = async (filters: {
  academicYearId: number;
  classId?: number;
  dateFrom: string;
  dateTo: string;
}): Promise<DailyAttendancePoint[]> => repository.dailyTrend(filters);

export const todayOverview = async (
  academicYearId: number,
): Promise<AttendanceSummary & { expected: number; notRecorded: number }> => {
  const totals = await repository.todayOverview(academicYearId);
  const totalRecords = totals.present + totals.absent + totals.late + totals.excused + totals.leave;

  return {
    ...withRate({ ...totals, totalRecords }),
    expected: totals.expected,
    notRecorded: Math.max(totals.expected - totalRecords, 0),
  };
};

export const listClassesMissingAttendance = async (
  academicYearId: number,
  attendanceDate: string,
  teacherId?: number,
) => repository.findClassesMissingAttendance(academicYearId, attendanceDate, teacherId);

export const listReasons = async (): Promise<AttendanceReasonDto[]> => {
  const rows = await repository.findReasons();
  return rows.map(toReasonDto);
};
