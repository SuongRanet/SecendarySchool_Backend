import { withTransaction } from '../../database/connection';
import type {
  AuditContext,
  AuthenticatedUser,
  PaginatedResult,
  PaginationParams,
} from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as assessmentService from '../assessments/assessment.service';
import * as classRepository from '../classes/class.repository';
import * as repository from './exam.repository';
import type {
  CreateExamInput,
  ExamDto,
  ExamFilters,
  ExamResultDto,
  ExamResultRow,
  ExamRow,
  UpdateExamInput,
} from './exam.types';

const toDto = (row: ExamRow): ExamDto => ({
  id: row.id,
  academicYearId: row.academic_year_id,
  academicYearName: row.academic_year_name ?? '',
  termId: row.term_id,
  termName: row.term_name ?? null,
  classId: row.class_id,
  className: row.class_name ?? '',
  subjectId: row.subject_id,
  subjectName: row.subject_name ?? '',
  roomId: row.room_id,
  roomName: row.room_name ?? null,
  title: row.title,
  type: row.type,
  examDate: row.exam_date,
  startTime: row.start_time,
  durationMinutes: row.duration_minutes,
  maxScore: row.max_score,
  instructions: row.instructions,
  gradedCount: row.graded_count ?? 0,
  studentCount: row.student_count ?? 0,
  averageScore: row.average_score ?? null,
  createdAt: row.created_at,
});

const toResultDto = (row: ExamResultRow, maxScore: number): ExamResultDto => ({
  id: row.id ?? null,
  examId: row.exam_id,
  studentId: row.student_id,
  studentCode: row.student_code ?? '',
  studentName: `${row.first_name_en ?? ''} ${row.last_name_en ?? ''}`.trim(),
  rollNumber: row.roll_number ?? null,
  score: row.score,
  percentage:
    row.score !== null && maxScore > 0 ? Number(((row.score / maxScore) * 100).toFixed(2)) : null,
  isAbsent: row.is_absent,
  remark: row.remark,
  gradedAt: row.graded_at,
});

export const list = async (
  filters: ExamFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<ExamDto>> => {
  const result = await repository.findExams(filters, pagination);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const listUpcoming = async (
  academicYearId: number,
  limit = 10,
  classId?: number,
): Promise<ExamDto[]> => {
  const rows = await repository.findUpcoming(academicYearId, limit, classId);
  return rows.map(toDto);
};

export const getById = async (id: number): Promise<ExamDto> => {
  const row = await repository.findExamById(id);

  if (!row) {
    throw AppError.notFound('Exam not found', 'EXAM_NOT_FOUND');
  }

  return toDto(row);
};

export const create = async (
  input: CreateExamInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<ExamDto> => {
  await assessmentService.assertCanManage(user, input.classId, input.subjectId);

  const classRow = await classRepository.findClassById(input.classId);

  if (!classRow) {
    throw AppError.badRequest('The selected class does not exist', 'CLASS_NOT_FOUND');
  }

  if (classRow.academic_year_status === 'CLOSED') {
    throw AppError.conflict('The academic year of this class is closed', 'ACADEMIC_YEAR_CLOSED');
  }

  const created = await withTransaction(async (client) => {
    const row = await repository.insertExam(
      { ...input, academicYearId: classRow.academic_year_id, createdBy: context.userId },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'exam',
        entityId: row.id,
        description: `Scheduled exam "${row.title}" for ${classRow.name} on ${row.exam_date}`,
        newValue: { title: row.title, type: row.type, examDate: row.exam_date },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  return toDto(created);
};

export const update = async (
  id: number,
  input: UpdateExamInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<ExamDto> => {
  const existing = await repository.findExamById(id);

  if (!existing) {
    throw AppError.notFound('Exam not found', 'EXAM_NOT_FOUND');
  }

  await assessmentService.assertCanManage(user, existing.class_id, existing.subject_id);

  if (existing.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'This exam belongs to a closed academic year and cannot be modified',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  const { oldValue, newValue } = auditService.diff(
    {
      title: existing.title,
      type: existing.type,
      examDate: existing.exam_date,
      startTime: existing.start_time,
      maxScore: existing.max_score,
      roomId: existing.room_id,
    },
    input,
  );

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateExam(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'exam',
        entityId: id,
        description: `Updated exam "${existing.title}"`,
        oldValue,
        newValue,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (!updated) {
    throw AppError.notFound('Exam not found', 'EXAM_NOT_FOUND');
  }

  return toDto(updated);
};

export const archive = async (
  id: number,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<void> => {
  const existing = await repository.findExamById(id);

  if (!existing) {
    throw AppError.notFound('Exam not found', 'EXAM_NOT_FOUND');
  }

  await assessmentService.assertCanManage(user, existing.class_id, existing.subject_id);

  await withTransaction(async (client) => {
    await repository.softDeleteExam(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'exam',
        entityId: id,
        description: `Archived exam "${existing.title}"`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const listResults = async (examId: number): Promise<ExamResultDto[]> => {
  const exam = await repository.findExamById(examId);

  if (!exam) {
    throw AppError.notFound('Exam not found', 'EXAM_NOT_FOUND');
  }

  const rows = await repository.findResultSheet(examId, exam.class_id);
  return rows.map((row) => toResultDto(row, exam.max_score));
};

export const saveResults = async (
  examId: number,
  results: { studentId: number; score?: number | null; isAbsent?: boolean; remark?: string | null }[],
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<ExamResultDto[]> => {
  const exam = await repository.findExamById(examId);

  if (!exam) {
    throw AppError.notFound('Exam not found', 'EXAM_NOT_FOUND');
  }

  await assessmentService.assertCanManage(user, exam.class_id, exam.subject_id);

  if (exam.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'This exam belongs to a closed academic year and cannot be modified',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  const errors = results
    .filter((result) => result.score !== null && result.score !== undefined)
    .filter((result) => (result.score as number) < 0 || (result.score as number) > exam.max_score)
    .map((result) => ({
      field: `results.${result.studentId}.score`,
      message: `Score must be between 0 and ${exam.max_score}`,
    }));

  if (errors.length > 0) {
    throw AppError.validation('Validation failed', errors);
  }

  await withTransaction(async (client) => {
    for (const result of results) {
      await repository.upsertExamResult(
        {
          examId,
          studentId: result.studentId,
          score: result.isAbsent ? null : result.score ?? null,
          isAbsent: result.isAbsent ?? false,
          remark: result.remark ?? null,
          gradedBy: context.userId,
        },
        client,
      );
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'exam_result',
        entityId: examId,
        description: `Entered ${results.length} result(s) for exam "${exam.title}"`,
        newValue: { examId, count: results.length },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return listResults(examId);
};
