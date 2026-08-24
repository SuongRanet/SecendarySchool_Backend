import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { asyncHandler } from '../../utils/async-handler';
import { resolvePagination, resolveSort } from '../../utils/pagination';
import { getAuditContext, requireUser } from '../../utils/request-context';
import * as enrollmentService from '../enrollments/enrollment.service';
import { applyStudentScope, assertStudentReadAccess } from './student.access';
import { STUDENT_SORT_COLUMNS } from './student.repository';
import type {
  CreateStudentAccountBody,
  CreateStudentBody,
  LinkParentBody,
  ListStudentsQuery,
  UpdateStudentBody,
} from './student.schema';
import * as service from './student.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListStudentsQuery;
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, STUDENT_SORT_COLUMNS, 'first_name_en');

  const filters = applyStudentScope(req, {
    search: query.search,
    status: query.status,
    gender: query.gender,
    gradeLevelId: query.gradeLevelId,
    classId: query.classId,
    academicYearId: query.academicYearId,
    parentId: query.parentId,
    includeArchived: query.includeArchived,
    unassigned: query.unassigned,
  });

  const result = await service.list(filters, pagination, {
    sortBy: sort.sortBy,
    sortOrder: query.sortOrder ? sort.sortOrder : 'ASC',
  });

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Students loaded successfully',
  );
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  await assertStudentReadAccess(req, studentId);

  const student = await service.getById(studentId);

  return sendSuccess(res, student, 'Student loaded successfully');
});

/**
 * The signed-in student's own record.
 *
 * A student never passes their own id: it is read from the token, so a student
 * cannot reach another student's record by changing a number in the URL. The
 * student portal calls these three endpoints.
 */
const requireStudentId = (req: Request): number => {
  const user = requireUser(req);

  if (!user.studentId) {
    throw AppError.notFound('No student profile is linked to this account', 'STUDENT_NOT_FOUND');
  }

  return user.studentId;
};

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const student = await service.getById(requireStudentId(req));

  return sendSuccess(res, student, 'Student profile loaded successfully');
});

export const getMyEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const history = await service.listEnrollmentHistory(requireStudentId(req));

  return sendSuccess(res, history, 'Enrollment history loaded successfully');
});

export const getMyCurrentEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const enrollment = await enrollmentService.getCurrentForStudent(requireStudentId(req));

  return sendSuccess(res, enrollment, 'Current enrollment loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateStudentBody;
  const student = await service.create(body, getAuditContext(req));

  return sendCreated(res, student, 'Student created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateStudentBody;
  const student = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, student, 'Student updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Student archived successfully');
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const student = await service.restore(Number(req.params.id), getAuditContext(req));

  return sendSuccess(res, student, 'Student restored successfully');
});

export const listParents = asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  await assertStudentReadAccess(req, studentId);

  const parents = await service.listParents(studentId);

  return sendSuccess(res, parents, 'Guardians loaded successfully');
});

export const linkParent = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as LinkParentBody;
  const parents = await service.linkParent(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, parents, 'Guardian linked successfully');
});

export const unlinkParent = asyncHandler(async (req: Request, res: Response) => {
  await service.unlinkParent(
    Number(req.params.id),
    Number(req.params.parentId),
    getAuditContext(req),
  );

  return sendNoContent(res, 'Guardian unlinked successfully');
});

export const listEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  await assertStudentReadAccess(req, studentId);

  const history = await service.listEnrollmentHistory(studentId);

  return sendSuccess(res, history, 'Enrollment history loaded successfully');
});

export const getCurrentEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  await assertStudentReadAccess(req, studentId);

  const enrollment = await enrollmentService.getCurrentForStudent(studentId);

  return sendSuccess(res, enrollment, 'Current enrollment loaded successfully');
});

export const createAccount = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateStudentAccountBody;
  const student = await service.createAccount(Number(req.params.id), body, getAuditContext(req));

  return sendCreated(res, student, 'Student account created successfully');
});

export const statusBreakdown = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await service.statusBreakdown();

  return sendSuccess(res, stats, 'Student statistics loaded successfully');
});
