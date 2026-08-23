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
import { getAuditContext, requireUser } from '../../utils/request-context';
import { assertStudentReadAccess } from '../students/student.access';
import type {
  BehaviorSummaryQuery,
  CreateBehaviorBody,
  CreateCommentBody,
  ListBehaviorsQuery,
  ListCommentsQuery,
  UpdateBehaviorBody,
} from './behavior.schema';
import * as service from './behavior.service';

/** A guardian only sees the notes a teacher marked visible to parents. */
const parentVisibilityFilter = (req: Request): boolean => {
  const user = requireUser(req);
  return !isElevated(user) && !user.teacherId;
};

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListBehaviorsQuery;
  const pagination = resolvePagination(query.page, query.limit);

  if (query.studentId) {
    await assertStudentReadAccess(req, query.studentId);
  }

  const result = await service.list(
    {
      search: query.search,
      studentId: query.studentId,
      classId: query.classId,
      academicYearId: query.academicYearId,
      type: query.type,
      dateFrom: query.dateFrom ?? undefined,
      dateTo: query.dateTo ?? undefined,
      visibleToParentOnly: query.visibleToParentOnly ?? parentVisibilityFilter(req),
    },
    pagination,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Behavior records loaded successfully',
  );
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const behavior = await service.getById(Number(req.params.id));
  await assertStudentReadAccess(req, behavior.studentId);

  return sendSuccess(res, behavior, 'Behavior record loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateBehaviorBody;
  const behavior = await service.create(body, requireUser(req), getAuditContext(req));

  return sendCreated(res, behavior, 'Behavior record created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateBehaviorBody;
  const behavior = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, behavior, 'Behavior record updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Behavior record archived successfully');
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.studentId);
  await assertStudentReadAccess(req, studentId);

  const query = req.query as unknown as BehaviorSummaryQuery;
  const result = await service.summarize(studentId, query.academicYearId);

  return sendSuccess(res, result, 'Behavior summary loaded successfully');
});

export const listComments = asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.studentId);
  await assertStudentReadAccess(req, studentId);

  const query = req.query as unknown as ListCommentsQuery;
  const comments = await service.listComments(studentId, {
    academicYearId: query.academicYearId,
    termId: query.termId,
    visibleToParentOnly: query.visibleToParentOnly ?? parentVisibilityFilter(req),
  });

  return sendSuccess(res, comments, 'Comments loaded successfully');
});

export const createComment = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateCommentBody;
  const comment = await service.createComment(body, requireUser(req), getAuditContext(req));

  return sendCreated(res, comment, 'Comment added successfully');
});

export const removeComment = asyncHandler(async (req: Request, res: Response) => {
  await service.removeComment(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Comment removed successfully');
});
