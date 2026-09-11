import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { resolvePagination, resolveSort } from '../../utils/pagination';
import { getAuditContext } from '../../utils/request-context';
import { ENROLLMENT_SORT_COLUMNS } from './enrollment.repository';
import type {
  CreateEnrollmentBody,
  EnrollmentStatsQuery,
  ListEnrollmentsQuery,
  GraduateCohortBody,
  PromoteCohortBody,
  TransferEnrollmentBody,
  UpdateEnrollmentBody,
  WithdrawEnrollmentBody,
} from './enrollment.schema';
import * as service from './enrollment.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListEnrollmentsQuery;
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, ENROLLMENT_SORT_COLUMNS, 'enrolled_date');

  const result = await service.list(
    {
      search: query.search,
      academicYearId: query.academicYearId,
      classId: query.classId,
      gradeLevelId: query.gradeLevelId,
      studentId: query.studentId,
      status: query.status,
    },
    pagination,
    sort,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Enrollments loaded successfully',
  );
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const enrollment = await service.getById(Number(req.params.id));

  return sendSuccess(res, enrollment, 'Enrollment loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateEnrollmentBody;
  const enrollment = await service.create(body, getAuditContext(req));

  return sendCreated(res, enrollment, 'Student enrolled successfully');
});

export const transfer = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as TransferEnrollmentBody;
  const enrollment = await service.transfer(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, enrollment, 'Student transferred successfully');
});

export const withdraw = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as WithdrawEnrollmentBody;
  const enrollment = await service.withdraw(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, enrollment, 'Enrollment closed successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateEnrollmentBody;
  const enrollment = await service.updateDetails(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, enrollment, 'Enrollment updated successfully');
});

export const graduateCohort = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as GraduateCohortBody;
  const result = await service.graduateExitGrade(body, getAuditContext(req));

  return sendSuccess(res, result, `Graduated ${result.graduated} pupil(s)`);
});

export const promoteCohort = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as PromoteCohortBody;
  const result = await service.promoteCohort(body, getAuditContext(req));

  return sendSuccess(res, result, `Promoted ${result.promoted} student(s) successfully`);
});

export const statsByGrade = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as EnrollmentStatsQuery;
  const stats = await service.enrollmentStatsByGrade(query.academicYearId);

  return sendSuccess(res, stats, 'Enrollment statistics loaded successfully');
});

export const statsByClass = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as EnrollmentStatsQuery;
  const stats = await service.enrollmentStatsByClass(query.academicYearId);

  return sendSuccess(res, stats, 'Enrollment statistics loaded successfully');
});
