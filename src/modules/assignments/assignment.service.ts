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
import * as fileService from '../files/file.service';
import * as notificationService from '../notifications/notification.service';
import * as studentRepository from '../students/student.repository';
import * as repository from './assignment.repository';
import type {
  AssignmentDto,
  AssignmentFilters,
  AssignmentRow,
  CreateAssignmentInput,
  SubmissionDto,
  SubmissionRow,
  UpdateAssignmentInput,
} from './assignment.types';

const toDto = (row: AssignmentRow): AssignmentDto => ({
  id: row.id,
  academicYearId: row.academic_year_id,
  termId: row.term_id,
  classId: row.class_id,
  className: row.class_name ?? '',
  subjectId: row.subject_id,
  subjectName: row.subject_name ?? '',
  teacherId: row.teacher_id,
  teacherName: row.teacher_name ?? null,
  title: row.title,
  description: row.description,
  instructions: row.instructions,
  attachmentUrl: row.attachment_url,
  assignedDate: row.assigned_date,
  dueDate: row.due_date,
  maxScore: row.max_score,
  status: row.status,
  isOverdue: row.status === 'PUBLISHED' && new Date(row.due_date) < new Date(),
  submissionCount: row.submission_count ?? 0,
  studentCount: row.student_count ?? 0,
  gradedCount: row.graded_count ?? 0,
  mySubmission: row.submission_status
    ? {
        status: row.submission_status,
        score: row.submission_score ?? null,
        feedback: row.submission_feedback ?? null,
      }
    : null,
  createdAt: row.created_at,
});

const toSubmissionDto = (row: SubmissionRow): SubmissionDto => ({
  id: row.id ?? null,
  assignmentId: row.assignment_id,
  studentId: row.student_id,
  studentCode: row.student_code ?? '',
  studentName: `${row.first_name_en ?? ''} ${row.last_name_en ?? ''}`.trim(),
  rollNumber: row.roll_number ?? null,
  status: row.status,
  content: row.content,
  attachmentUrl: row.attachment_url,
  submittedAt: row.submitted_at,
  score: row.score,
  feedback: row.feedback,
  gradedAt: row.graded_at,
});

export const list = async (
  filters: AssignmentFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<AssignmentDto>> => {
  const result = await repository.findAssignments(filters, pagination);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const getById = async (id: number): Promise<AssignmentDto> => {
  const row = await repository.findAssignmentById(id);

  if (!row) {
    throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  return toDto(row);
};

export const create = async (
  input: CreateAssignmentInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<AssignmentDto> => {
  await assessmentService.assertCanManage(user, input.classId, input.subjectId);
  assertStoredAttachment(input.attachmentUrl);

  const classRow = await classRepository.findClassById(input.classId);

  if (!classRow) {
    throw AppError.badRequest('The selected class does not exist', 'CLASS_NOT_FOUND');
  }

  if (classRow.academic_year_status === 'CLOSED') {
    throw AppError.conflict('The academic year of this class is closed', 'ACADEMIC_YEAR_CLOSED');
  }

  const created = await withTransaction(async (client) => {
    const row = await repository.insertAssignment(
      {
        ...input,
        academicYearId: classRow.academic_year_id,
        /*
         * The teacher named on the request, falling back to whoever is setting
         * it.
         *
         * The body already accepted `teacherId` and this ignored it, so homework
         * created by anyone without a teacher record of their own — an
         * administrator covering for absence, the seed — was stored with no
         * teacher at all. Nothing showed the gap until submissions had to be
         * announced to someone and there was nobody to announce them to.
         */
        teacherId: input.teacherId ?? user.teacherId ?? null,
        createdBy: context.userId,
      },
      client,
    );

    if (row.status === 'PUBLISHED') {
      await repository.seedSubmissions(row.id, row.class_id, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'assignment',
        entityId: row.id,
        description: `Created assignment "${row.title}" for ${classRow.name}`,
        newValue: { title: row.title, dueDate: row.due_date, status: row.status },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (created.status === 'PUBLISHED') {
    await notificationService.dispatch({
      type: 'NEW_ASSIGNMENT',
      title: `New homework: ${created.title}`,
      body: `${created.subject_name} — due ${created.due_date}`,
      entityType: 'assignment',
      entityId: created.id,
      actionUrl: `/assignments/${created.id}`,
      createdBy: context.userId,
      audience: { scope: 'CLASS', classId: created.class_id },
    });
  }

  return toDto(created);
};

export const update = async (
  id: number,
  input: UpdateAssignmentInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<AssignmentDto> => {
  const existing = await repository.findAssignmentById(id);

  if (!existing) {
    throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  await assessmentService.assertCanManage(user, existing.class_id, existing.subject_id);
  assertStoredAttachment(input.attachmentUrl);

  const { oldValue, newValue } = auditService.diff(
    {
      title: existing.title,
      description: existing.description,
      dueDate: existing.due_date,
      maxScore: existing.max_score,
    },
    input,
  );

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateAssignment(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'assignment',
        entityId: id,
        description: `Updated assignment "${existing.title}"`,
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
    throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  return toDto(updated);
};

export const publish = async (
  id: number,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<AssignmentDto> => {
  const existing = await repository.findAssignmentById(id);

  if (!existing) {
    throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  await assessmentService.assertCanManage(user, existing.class_id, existing.subject_id);

  const published = await withTransaction(async (client) => {
    const row = await repository.setStatus(id, 'PUBLISHED', client);
    await repository.seedSubmissions(id, existing.class_id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'PUBLISH',
        entityType: 'assignment',
        entityId: id,
        description: `Published assignment "${existing.title}"`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (published) {
    await notificationService.dispatch({
      type: 'NEW_ASSIGNMENT',
      title: `New homework: ${published.title}`,
      body: `${published.subject_name} — due ${published.due_date}`,
      entityType: 'assignment',
      entityId: published.id,
      actionUrl: `/assignments/${published.id}`,
      createdBy: context.userId,
      audience: { scope: 'CLASS', classId: published.class_id },
    });

    return toDto(published);
  }

  throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
};

export const close = async (
  id: number,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<AssignmentDto> => {
  const existing = await repository.findAssignmentById(id);

  if (!existing) {
    throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  await assessmentService.assertCanManage(user, existing.class_id, existing.subject_id);

  const closed = await withTransaction(async (client) => {
    const row = await repository.setStatus(id, 'CLOSED', client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'assignment',
        entityId: id,
        description: `Closed assignment "${existing.title}"`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (!closed) {
    throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  return toDto(closed);
};

export const archive = async (
  id: number,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<void> => {
  const existing = await repository.findAssignmentById(id);

  if (!existing) {
    throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  await assessmentService.assertCanManage(user, existing.class_id, existing.subject_id);

  await withTransaction(async (client) => {
    await repository.softDeleteAssignment(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'assignment',
        entityId: id,
        description: `Archived assignment "${existing.title}"`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const listSubmissions = async (assignmentId: number): Promise<SubmissionDto[]> => {
  const assignment = await repository.findAssignmentById(assignmentId);

  if (!assignment) {
    throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  await repository.markOverdueAsMissing();

  const rows = await repository.findSubmissions(assignmentId, assignment.class_id);
  return rows.map(toSubmissionDto);
};

export const gradeSubmissions = async (
  assignmentId: number,
  entries: { studentId: number; score?: number | null; feedback?: string | null }[],
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<SubmissionDto[]> => {
  const assignment = await repository.findAssignmentById(assignmentId);

  if (!assignment) {
    throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  await assessmentService.assertCanManage(user, assignment.class_id, assignment.subject_id);

  const maxScore = assignment.max_score;

  if (maxScore !== null) {
    const errors = entries
      .filter((entry) => entry.score !== null && entry.score !== undefined)
      .filter((entry) => (entry.score as number) < 0 || (entry.score as number) > maxScore)
      .map((entry) => ({
        field: `results.${entry.studentId}.score`,
        message: `Score must be between 0 and ${maxScore}`,
      }));

    if (errors.length > 0) {
      throw AppError.validation('Validation failed', errors);
    }
  }

  await withTransaction(async (client) => {
    for (const entry of entries) {
      await repository.gradeSubmission(
        {
          assignmentId,
          studentId: entry.studentId,
          score: entry.score ?? null,
          feedback: entry.feedback ?? null,
          status: 'GRADED',
          gradedBy: context.userId,
        },
        client,
      );
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'submission',
        entityId: assignmentId,
        description: `Graded ${entries.length} submission(s) for "${assignment.title}"`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  /**
   * One notification per pupil, carrying their own mark and nobody else's.
   *
   * A class-wide notification would be simpler and quite wrong: a mark is the
   * pupil's own business, and the whole point of `notifyStudent` is that it
   * cannot reach the rest of the class.
   */
  for (const entry of entries) {
    await notificationService.notifyStudent(entry.studentId, {
      type: 'HOMEWORK_GRADED',
      title: `${assignment.title} has been marked`,
      body:
        entry.score === null || entry.score === undefined
          ? (assignment.subject_name ?? 'Homework')
          : `${assignment.subject_name ?? 'Homework'} — ${entry.score}/${assignment.max_score ?? 0}`,
      entityType: 'assignment',
      entityId: assignmentId,
      actionUrl: `/student/homework/${assignmentId}`,
      createdBy: context.userId,
    });
  }

  return listSubmissions(assignmentId);
};

/**
 * An attachment must name a file this server actually stored. The column is a
 * plain string, so without this a client could hand in any text and have it read
 * back as a link.
 */
const assertStoredAttachment = (attachmentUrl: string | null | undefined): void => {
  if (!attachmentUrl) {
    return;
  }

  if (!fileService.parseFileUrl(attachmentUrl)) {
    throw AppError.badRequest(
      'That attachment does not refer to an uploaded file',
      'INVALID_ATTACHMENT',
    );
  }
};

/** A student submitting their own homework. */
export const submit = async (
  assignmentId: number,
  studentId: number,
  input: { content?: string | null; attachmentUrl?: string | null },
  context: AuditContext,
): Promise<SubmissionDto[]> => {
  const assignment = await repository.findAssignmentById(assignmentId);

  if (!assignment) {
    throw AppError.notFound('Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  if (assignment.status !== 'PUBLISHED') {
    throw AppError.conflict('This assignment is not open for submission', 'ASSIGNMENT_NOT_OPEN');
  }

  assertStoredAttachment(input.attachmentUrl);

  // Handing work in means handing something in: an empty note with no file
  // would otherwise be recorded as a submission and hide the fact that nothing
  // was done.
  if (!input.content?.trim() && !input.attachmentUrl) {
    throw AppError.badRequest(
      'Write an answer or attach a file before handing in',
      'SUBMISSION_EMPTY',
    );
  }

  await withTransaction(async (client) => {
    await repository.recordSubmission(
      {
        assignmentId,
        studentId,
        content: input.content ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        isLate: new Date(assignment.due_date) < new Date(),
      },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'submission',
        entityId: assignmentId,
        description: `Submitted homework "${assignment.title}"`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  /**
   * Sent after the transaction, not inside it.
   *
   * A notification is a courtesy; the submission is the record. Dispatching
   * inside the transaction would let a failure to notify roll back a pupil's
   * handed-in work, which is the wrong way round.
   */
  const pupil = await studentRepository.findStudentById(studentId);
  const who = pupil
    ? `${pupil.first_name_en} ${pupil.last_name_en}`.trim()
    : 'A student';

  await notificationService.notifyTeacher(assignment.teacher_id, {
    type: 'HOMEWORK_SUBMITTED',
    title: `${who} handed in ${assignment.title}`,
    body: `${assignment.subject_name ?? 'Homework'} — ${assignment.class_name ?? ''}`.trim(),
    entityType: 'assignment',
    entityId: assignmentId,
    actionUrl: `/assignments/${assignmentId}`,
    createdBy: context.userId,
  });

  return listSubmissions(assignmentId);
};
