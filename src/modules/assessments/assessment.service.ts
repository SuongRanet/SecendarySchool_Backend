import { withTransaction } from '../../database/connection';
import { PERMISSIONS } from '../../config/permissions';
import { hasPermission, isElevated } from '../../middleware/role.middleware';
import type {
  AuditContext,
  AuthenticatedUser,
  PaginatedResult,
  PaginationParams,
  SortParams,
} from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as classRepository from '../classes/class.repository';
import * as enrollmentRepository from '../enrollments/enrollment.repository';
import * as teacherRepository from '../teachers/teacher.repository';
import * as repository from './assessment.repository';
import type { AssessmentSortColumn } from './assessment.repository';
import type {
  AssessmentDto,
  AssessmentFilters,
  AssessmentResultDto,
  AssessmentResultRow,
  AssessmentRow,
  AssessmentStatistics,
  CreateAssessmentInput,
  SaveResultsInput,
  UpdateAssessmentInput,
} from './assessment.types';

const toDto = (row: AssessmentRow): AssessmentDto => ({
  id: row.id,
  academicYearId: row.academic_year_id,
  academicYearName: row.academic_year_name ?? '',
  termId: row.term_id,
  termName: row.term_name ?? null,
  classId: row.class_id,
  className: row.class_name ?? '',
  subjectId: row.subject_id,
  subjectName: row.subject_name ?? '',
  teacherId: row.teacher_id,
  teacherName: row.teacher_name ?? null,
  title: row.title,
  description: row.description,
  type: row.type,
  maxScore: row.max_score,
  weightPercent: row.weight_percent,
  assessmentDate: row.assessment_date,
  isPublished: row.is_published,
  gradedCount: row.graded_count ?? 0,
  studentCount: row.student_count ?? 0,
  averageScore: row.average_score ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toResultDto = (row: AssessmentResultRow, maxScore: number): AssessmentResultDto => ({
  id: row.id ?? null,
  assessmentId: row.assessment_id,
  studentId: row.student_id,
  studentCode: row.student_code ?? '',
  studentName: `${row.first_name_en ?? ''} ${row.last_name_en ?? ''}`.trim(),
  studentNameKh:
    row.first_name_kh || row.last_name_kh
      ? `${row.first_name_kh ?? ''} ${row.last_name_kh ?? ''}`.trim()
      : null,
  profilePhoto: row.profile_photo ?? null,
  rollNumber: row.roll_number ?? null,
  score: row.score,
  percentage:
    row.score !== null && maxScore > 0 ? Number(((row.score / maxScore) * 100).toFixed(2)) : null,
  isAbsent: row.is_absent,
  feedback: row.feedback,
  gradedAt: row.graded_at,
});

/**
 * A teacher may only manage assessments for a class subject they are assigned to.
 * `grades.update_any` lets an administrator or principal act beyond that.
 */
export const assertCanManage = async (
  user: AuthenticatedUser,
  classId: number,
  subjectId: number,
): Promise<void> => {
  if (isElevated(user) || hasPermission(user, PERMISSIONS.GRADES_UPDATE_ANY)) {
    return;
  }

  if (!user.teacherId) {
    throw AppError.forbidden(
      'Only the teacher assigned to this class subject can manage its assessments',
      'ASSESSMENT_ACCESS_DENIED',
    );
  }

  const teaches = await teacherRepository.teacherTeachesSubject(user.teacherId, classId, subjectId);

  if (!teaches) {
    throw AppError.forbidden(
      'You are not assigned to teach this subject in this class',
      'ASSESSMENT_ACCESS_DENIED',
    );
  }
};

export const list = async (
  filters: AssessmentFilters,
  pagination: PaginationParams,
  sort: SortParams<AssessmentSortColumn>,
): Promise<PaginatedResult<AssessmentDto>> => {
  const result = await repository.findAssessments(filters, pagination, sort);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const getById = async (id: number): Promise<AssessmentDto> => {
  const row = await repository.findAssessmentById(id);

  if (!row) {
    throw AppError.notFound('Assessment not found', 'ASSESSMENT_NOT_FOUND');
  }

  return toDto(row);
};

export const create = async (
  input: CreateAssessmentInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<AssessmentDto> => {
  await assertCanManage(user, input.classId, input.subjectId);

  const classRow = await classRepository.findClassById(input.classId);

  if (!classRow) {
    throw AppError.badRequest('The selected class does not exist', 'CLASS_NOT_FOUND');
  }

  if (classRow.academic_year_status === 'CLOSED') {
    throw AppError.conflict('The academic year of this class is closed', 'ACADEMIC_YEAR_CLOSED');
  }

  const classSubjects = await classRepository.findClassSubjects(input.classId);
  const classSubject = classSubjects.find((item) => item.subject_id === input.subjectId);

  if (!classSubject) {
    throw AppError.badRequest(
      'This subject is not assigned to the selected class',
      'SUBJECT_NOT_IN_CLASS',
    );
  }

  const created = await withTransaction(async (client) => {
    const row = await repository.insertAssessment(
      {
        ...input,
        academicYearId: classRow.academic_year_id,
        classSubjectId: classSubject.id,
        teacherId: input.teacherId ?? classSubject.teacher_id ?? user.teacherId ?? null,
        createdBy: context.userId,
      },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'assessment',
        entityId: row.id,
        description: `Created assessment "${row.title}" for ${classRow.name}`,
        newValue: { title: row.title, type: row.type, maxScore: row.max_score },
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
  input: UpdateAssessmentInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<AssessmentDto> => {
  const existing = await repository.findAssessmentById(id);

  if (!existing) {
    throw AppError.notFound('Assessment not found', 'ASSESSMENT_NOT_FOUND');
  }

  await assertCanManage(user, existing.class_id, existing.subject_id);

  if (existing.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'This assessment belongs to a closed academic year and cannot be modified',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  const { oldValue, newValue } = auditService.diff(
    {
      title: existing.title,
      type: existing.type,
      maxScore: existing.max_score,
      weightPercent: existing.weight_percent,
      assessmentDate: existing.assessment_date,
      isPublished: existing.is_published,
    },
    input,
  );

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateAssessment(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'assessment',
        entityId: id,
        description: `Updated assessment "${existing.title}"`,
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
    throw AppError.notFound('Assessment not found', 'ASSESSMENT_NOT_FOUND');
  }

  return toDto(updated);
};

export const archive = async (
  id: number,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<void> => {
  const existing = await repository.findAssessmentById(id);

  if (!existing) {
    throw AppError.notFound('Assessment not found', 'ASSESSMENT_NOT_FOUND');
  }

  await assertCanManage(user, existing.class_id, existing.subject_id);

  if (existing.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'This assessment belongs to a closed academic year and cannot be modified',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  await withTransaction(async (client) => {
    await repository.softDeleteAssessment(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'assessment',
        entityId: id,
        description: `Archived assessment "${existing.title}"`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const listResults = async (assessmentId: number): Promise<AssessmentResultDto[]> => {
  const assessment = await repository.findAssessmentById(assessmentId);

  if (!assessment) {
    throw AppError.notFound('Assessment not found', 'ASSESSMENT_NOT_FOUND');
  }

  const rows = await repository.findResultSheet(assessmentId, assessment.class_id);
  return rows.map((row) => toResultDto(row, assessment.max_score));
};

/**
 * Saves the score sheet. Scores are validated against the assessment maximum, and
 * the whole sheet is written in one transaction.
 */
export const saveResults = async (
  assessmentId: number,
  input: SaveResultsInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<AssessmentResultDto[]> => {
  const assessment = await repository.findAssessmentById(assessmentId);

  if (!assessment) {
    throw AppError.notFound('Assessment not found', 'ASSESSMENT_NOT_FOUND');
  }

  await assertCanManage(user, assessment.class_id, assessment.subject_id);

  if (assessment.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'This assessment belongs to a closed academic year and cannot be modified',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  const errors = input.results
    .filter((result) => result.score !== null && result.score !== undefined)
    .filter((result) => (result.score as number) < 0 || (result.score as number) > assessment.max_score)
    .map((result) => ({
      field: `results.${result.studentId}.score`,
      message: `Score must be between 0 and ${assessment.max_score}`,
    }));

  if (errors.length > 0) {
    throw AppError.validation('Validation failed', errors);
  }

  const enrolled = await enrollmentRepository.findActiveEnrollmentsByClass(assessment.class_id);
  const enrollmentByStudent = new Map(enrolled.map((row) => [row.student_id, row.id]));

  for (const result of input.results) {
    if (!enrollmentByStudent.has(result.studentId)) {
      throw AppError.badRequest(
        `Student ${result.studentId} is not actively enrolled in this class`,
        'STUDENT_NOT_IN_CLASS',
      );
    }
  }

  await withTransaction(async (client) => {
    for (const result of input.results) {
      await repository.upsertResult(
        {
          assessmentId,
          studentId: result.studentId,
          enrollmentId: enrollmentByStudent.get(result.studentId) ?? null,
          score: result.isAbsent ? null : result.score ?? null,
          isAbsent: result.isAbsent ?? false,
          feedback: result.feedback ?? null,
          gradedBy: context.userId,
        },
        client,
      );
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'assessment_result',
        entityId: assessmentId,
        description: `Entered ${input.results.length} result(s) for "${assessment.title}"`,
        newValue: { assessmentId, count: input.results.length },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return listResults(assessmentId);
};

export const statistics = async (assessmentId: number): Promise<AssessmentStatistics> => {
  const assessment = await repository.findAssessmentById(assessmentId);

  if (!assessment) {
    throw AppError.notFound('Assessment not found', 'ASSESSMENT_NOT_FOUND');
  }

  return repository.computeStatistics(assessmentId);
};

export const setPublished = async (
  id: number,
  isPublished: boolean,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<AssessmentDto> => update(id, { isPublished }, user, context);

export const listPendingGrading = async (
  teacherId: number,
  academicYearId: number,
): Promise<AssessmentDto[]> => {
  const rows = await repository.findPendingGrading(teacherId, academicYearId);
  return rows.map(toDto);
};

export const listResultsForStudent = async (
  studentId: number,
  filters: { academicYearId?: number; termId?: number; subjectId?: number; classId?: number },
): Promise<
  {
    assessmentId: number;
    title: string;
    type: string;
    subjectId: number;
    assessmentDate: string | null;
    maxScore: number;
    score: number | null;
    percentage: number | null;
    isAbsent: boolean;
    feedback: string | null;
  }[]
> => {
  const rows = await repository.findResultsByStudent(studentId, filters);

  return rows.map((row) => ({
    assessmentId: row.assessment.id,
    title: row.assessment.title,
    type: row.assessment.type,
    subjectId: row.assessment.subject_id,
    assessmentDate: row.assessment.assessment_date,
    maxScore: Number(row.assessment.max_score),
    score: row.score,
    percentage:
      row.score !== null && Number(row.assessment.max_score) > 0
        ? Number(((row.score / Number(row.assessment.max_score)) * 100).toFixed(2))
        : null,
    isAbsent: row.is_absent,
    feedback: row.feedback,
  }));
};
