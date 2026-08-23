import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { isElevated } from '../../middleware/role.middleware';
import { resolvePagination } from '../../utils/pagination';
import { AppError } from '../../utils/app-error';
import { getAuditContext, requireUser } from '../../utils/request-context';
import { assertStudentReadAccess } from '../students/student.access';
import type {
  CreateAssignmentBody,
  GradeSubmissionsBody,
  ListAssignmentsQuery,
  SubmitAssignmentBody,
  UpdateAssignmentBody,
} from './assignment.schema';
import * as service from './assignment.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAssignmentsQuery;
  const user = requireUser(req);
  const pagination = resolvePagination(query.page, query.limit);

  // A student sees their own homework; a teacher sees what they issued.
  let studentId = query.studentId;

  if (!studentId && user.studentId && !isElevated(user) && !user.teacherId) {
    studentId = user.studentId;
  }

  if (studentId) {
    await assertStudentReadAccess(req, studentId);
  }

  const teacherId =
    !isElevated(user) && user.teacherId && !studentId ? user.teacherId : query.teacherId;

  const result = await service.list(
    {
      search: query.search,
      academicYearId: query.academicYearId,
      classId: query.classId,
      subjectId: query.subjectId,
      teacherId,
      studentId,
      status: query.status,
      dueFrom: query.dueFrom ?? undefined,
      dueTo: query.dueTo ?? undefined,
      pendingOnly: query.pendingOnly,
    },
    pagination,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Assignments loaded successfully',
  );
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await service.getById(Number(req.params.id));

  return sendSuccess(res, assignment, 'Assignment loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateAssignmentBody;
  const assignment = await service.create(body, requireUser(req), getAuditContext(req));

  return sendCreated(res, assignment, 'Assignment created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateAssignmentBody;
  const assignment = await service.update(
    Number(req.params.id),
    body,
    requireUser(req),
    getAuditContext(req),
  );

  return sendSuccess(res, assignment, 'Assignment updated successfully');
});

export const publish = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await service.publish(
    Number(req.params.id),
    requireUser(req),
    getAuditContext(req),
  );

  return sendSuccess(res, assignment, 'Assignment published successfully');
});

export const close = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await service.close(
    Number(req.params.id),
    requireUser(req),
    getAuditContext(req),
  );

  return sendSuccess(res, assignment, 'Assignment closed successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), requireUser(req), getAuditContext(req));

  return sendNoContent(res, 'Assignment archived successfully');
});

export const listSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const submissions = await service.listSubmissions(Number(req.params.id));

  return sendSuccess(res, submissions, 'Submissions loaded successfully');
});

export const gradeSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as GradeSubmissionsBody;
  const submissions = await service.gradeSubmissions(
    Number(req.params.id),
    body.results,
    requireUser(req),
    getAuditContext(req),
  );

  return sendSuccess(res, submissions, 'Submissions graded successfully');
});

export const submit = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SubmitAssignmentBody;
  const user = requireUser(req);
  const studentId = body.studentId ?? user.studentId;

  if (!studentId) {
    throw AppError.badRequest('A student must be specified', 'STUDENT_REQUIRED');
  }

  await assertStudentReadAccess(req, studentId);

  const submissions = await service.submit(
    Number(req.params.id),
    studentId,
    body,
    getAuditContext(req),
  );

  return sendSuccess(res, submissions, 'Homework submitted successfully');
});
