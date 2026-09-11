import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { resolvePagination, resolveSort } from '../../utils/pagination';
import { getAuditContext, requireUser } from '../../utils/request-context';
import { AppError } from '../../utils/app-error';
import { TEACHER_SORT_COLUMNS } from './teacher.repository';
import type {
  AssignSubjectsBody,
  CreateTeacherAccountBody,
  CreateTeacherBody,
  ListTeachersQuery,
  TeacherScopeQuery,
  UpdateTeacherBody,
} from './teacher.schema';
import * as service from './teacher.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListTeachersQuery;
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, TEACHER_SORT_COLUMNS, 'first_name_en');

  const result = await service.list(
    {
      search: query.search,
      status: query.status,
      subjectId: query.subjectId,
      classId: query.classId,
      hasAccount: query.hasAccount,
      includeArchived: query.includeArchived,
    },
    pagination,
    { sortBy: sort.sortBy, sortOrder: query.sortOrder ? sort.sortOrder : 'ASC' },
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Teachers loaded successfully',
  );
});

export const listOptions = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListTeachersQuery;
  const teachers = await service.listAll({ subjectId: query.subjectId });

  return sendSuccess(res, teachers, 'Teachers loaded successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const teacher = await service.getById(Number(req.params.id));

  return sendSuccess(res, teacher, 'Teacher loaded successfully');
});

/** Resolves the teacher profile bound to the token, for the self-scoped routes. */
const requireTeacherId = (req: Request): number => {
  const user = requireUser(req);

  if (!user.teacherId) {
    throw AppError.notFound('No teacher profile is linked to this account', 'TEACHER_NOT_FOUND');
  }

  return user.teacherId;
};

/** The signed-in teacher's own profile, used by the teacher workspace. */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const teacherId = requireTeacherId(req);

  const teacher = await service.getById(teacherId);

  return sendSuccess(res, teacher, 'Teacher profile loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateTeacherBody;
  const teacher = await service.create(body, getAuditContext(req));

  return sendCreated(res, teacher, 'Teacher created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateTeacherBody;
  const teacher = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, teacher, 'Teacher updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Teacher archived successfully');
});

export const assignSubjects = asyncHandler(async (req: Request, res: Response) => {
  const { subjectIds } = req.body as AssignSubjectsBody;
  const teacher = await service.assignSubjects(
    Number(req.params.id),
    subjectIds,
    getAuditContext(req),
  );

  return sendSuccess(res, teacher, 'Subjects assigned successfully');
});

export const listAssignments = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as TeacherScopeQuery;
  const assignments = await service.listAssignments(Number(req.params.id), query.academicYearId);

  return sendSuccess(res, assignments, 'Teacher assignments loaded successfully');
});

export const listSchedule = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as TeacherScopeQuery;
  const schedule = await service.listSchedule(Number(req.params.id), query.academicYearId);

  return sendSuccess(res, schedule, 'Teacher schedule loaded successfully');
});

export const listMyAssignments = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as TeacherScopeQuery;
  const assignments = await service.listMyAssignments(requireTeacherId(req), query.academicYearId);

  return sendSuccess(res, assignments, 'Teacher assignments loaded successfully');
});

export const listMySchedule = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as TeacherScopeQuery;
  const schedule = await service.listSchedule(requireTeacherId(req), query.academicYearId);

  return sendSuccess(res, schedule, 'Teacher schedule loaded successfully');
});

export const createAccount = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateTeacherAccountBody;
  const teacher = await service.createAccount(Number(req.params.id), body, getAuditContext(req));

  return sendCreated(res, teacher, 'Teacher account created successfully');
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const restored = await service.restore(Number(req.params.id), getAuditContext(req));

  return sendSuccess(res, restored, 'Teacher restored successfully');
});
