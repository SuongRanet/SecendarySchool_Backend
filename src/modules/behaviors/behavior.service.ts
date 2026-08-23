import { withTransaction } from '../../database/connection';
import type {
  AuditContext,
  AuthenticatedUser,
  PaginatedResult,
  PaginationParams,
} from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as academicYearService from '../academic-years/academic-year.service';
import * as repository from './behavior.repository';
import type {
  BehaviorDto,
  BehaviorFilters,
  BehaviorRow,
  BehaviorSummary,
  CreateBehaviorInput,
  CreateCommentInput,
  StudentCommentDto,
  StudentCommentRow,
  UpdateBehaviorInput,
} from './behavior.types';

const toDto = (row: BehaviorRow): BehaviorDto => ({
  id: row.id,
  studentId: row.student_id,
  studentCode: row.student_code ?? '',
  studentName: `${row.student_first_name ?? ''} ${row.student_last_name ?? ''}`.trim(),
  academicYearId: row.academic_year_id,
  classId: row.class_id,
  className: row.class_name ?? null,
  teacherId: row.teacher_id,
  teacherName: row.teacher_name ?? null,
  type: row.type,
  title: row.title,
  description: row.description,
  occurredOn: row.occurred_on,
  points: row.points,
  actionTaken: row.action_taken,
  visibleToParent: row.visible_to_parent,
  createdAt: row.created_at,
});

const toCommentDto = (row: StudentCommentRow): StudentCommentDto => ({
  id: row.id,
  studentId: row.student_id,
  academicYearId: row.academic_year_id,
  termId: row.term_id,
  termName: row.term_name ?? null,
  classId: row.class_id,
  subjectId: row.subject_id,
  subjectName: row.subject_name ?? null,
  teacherId: row.teacher_id,
  teacherName: row.teacher_name ?? null,
  isHomeroom: row.is_homeroom,
  comment: row.comment,
  visibleToParent: row.visible_to_parent,
  createdAt: row.created_at,
});

export const list = async (
  filters: BehaviorFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<BehaviorDto>> => {
  const result = await repository.findBehaviors(filters, pagination);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const getById = async (id: number): Promise<BehaviorDto> => {
  const row = await repository.findBehaviorById(id);

  if (!row) {
    throw AppError.notFound('Behavior record not found', 'BEHAVIOR_NOT_FOUND');
  }

  return toDto(row);
};

export const create = async (
  input: CreateBehaviorInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<BehaviorDto> => {
  const year = await academicYearService.requireActiveYear();

  const created = await withTransaction(async (client) => {
    const row = await repository.insertBehavior(
      {
        ...input,
        academicYearId: year.id,
        teacherId: user.teacherId ?? null,
        recordedBy: context.userId,
      },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'student_behavior',
        entityId: row.id,
        description: `Recorded a ${row.type} behavior note for ${row.student_first_name} ${row.student_last_name}`,
        newValue: { type: row.type, title: row.title, points: row.points },
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
  input: UpdateBehaviorInput,
  context: AuditContext,
): Promise<BehaviorDto> => {
  const existing = await repository.findBehaviorById(id);

  if (!existing) {
    throw AppError.notFound('Behavior record not found', 'BEHAVIOR_NOT_FOUND');
  }

  const { oldValue, newValue } = auditService.diff(
    {
      type: existing.type,
      title: existing.title,
      description: existing.description,
      points: existing.points,
      visibleToParent: existing.visible_to_parent,
    },
    input,
  );

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateBehavior(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'student_behavior',
        entityId: id,
        description: `Updated a behavior note for ${existing.student_first_name} ${existing.student_last_name}`,
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
    throw AppError.notFound('Behavior record not found', 'BEHAVIOR_NOT_FOUND');
  }

  return toDto(updated);
};

export const archive = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findBehaviorById(id);

  if (!existing) {
    throw AppError.notFound('Behavior record not found', 'BEHAVIOR_NOT_FOUND');
  }

  await withTransaction(async (client) => {
    await repository.softDeleteBehavior(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'student_behavior',
        entityId: id,
        description: `Archived a behavior note for ${existing.student_first_name} ${existing.student_last_name}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const summarize = async (
  studentId: number,
  academicYearId?: number,
): Promise<BehaviorSummary> => repository.summarize(studentId, academicYearId);

export const listComments = async (
  studentId: number,
  filters: { academicYearId?: number; termId?: number; visibleToParentOnly?: boolean },
): Promise<StudentCommentDto[]> => {
  const rows = await repository.findComments(studentId, filters);
  return rows.map(toCommentDto);
};

export const createComment = async (
  input: CreateCommentInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<StudentCommentDto> => {
  const year = await academicYearService.requireActiveYear();

  const created = await withTransaction(async (client) => {
    const row = await repository.insertComment(
      {
        ...input,
        academicYearId: year.id,
        teacherId: user.teacherId ?? null,
        createdBy: context.userId,
      },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'student_comment',
        entityId: row.id,
        description: `Added a comment for student ${input.studentId}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  return toCommentDto(created);
};

export const removeComment = async (id: number, context: AuditContext): Promise<void> => {
  const removed = await repository.softDeleteComment(id);

  if (!removed) {
    throw AppError.notFound('Comment not found', 'COMMENT_NOT_FOUND');
  }

  await auditService.record({
    userId: context.userId,
    action: 'ARCHIVE',
    entityType: 'student_comment',
    entityId: id,
    description: 'Archived a student comment',
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
};
