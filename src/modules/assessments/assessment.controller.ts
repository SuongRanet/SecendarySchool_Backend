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
import { resolvePagination, resolveSort } from '../../utils/pagination';
import { getAuditContext, requireUser } from '../../utils/request-context';
import * as academicYearService from '../academic-years/academic-year.service';
import { AppError } from '../../utils/app-error';
import { ASSESSMENT_SORT_COLUMNS } from './assessment.repository';
import type {
  CreateAssessmentBody,
  ListAssessmentsQuery,
  SaveResultsBody,
  SetPublishedBody,
  UpdateAssessmentBody,
} from './assessment.schema';
import * as service from './assessment.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAssessmentsQuery;
  const user = requireUser(req);
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, ASSESSMENT_SORT_COLUMNS, 'assessment_date');

  // A teacher without school-wide access sees only their own assessments.
  const teacherId = !isElevated(user) && user.teacherId ? user.teacherId : query.teacherId;

  const result = await service.list(
    {
      search: query.search,
      academicYearId: query.academicYearId,
      termId: query.termId,
      classId: query.classId,
      subjectId: query.subjectId,
      teacherId,
      type: query.type,
      isPublished: query.isPublished,
    },
    pagination,
    sort,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Assessments loaded successfully',
  );
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const assessment = await service.getById(Number(req.params.id));

  return sendSuccess(res, assessment, 'Assessment loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateAssessmentBody;
  const assessment = await service.create(body, requireUser(req), getAuditContext(req));

  return sendCreated(res, assessment, 'Assessment created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateAssessmentBody;
  const assessment = await service.update(
    Number(req.params.id),
    body,
    requireUser(req),
    getAuditContext(req),
  );

  return sendSuccess(res, assessment, 'Assessment updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), requireUser(req), getAuditContext(req));

  return sendNoContent(res, 'Assessment archived successfully');
});

export const setPublished = asyncHandler(async (req: Request, res: Response) => {
  const { isPublished } = req.body as SetPublishedBody;
  const assessment = await service.setPublished(
    Number(req.params.id),
    isPublished,
    requireUser(req),
    getAuditContext(req),
  );

  return sendSuccess(res, assessment, 'Assessment publication updated successfully');
});

export const listResults = asyncHandler(async (req: Request, res: Response) => {
  const results = await service.listResults(Number(req.params.id));

  return sendSuccess(res, results, 'Results loaded successfully');
});

export const saveResults = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SaveResultsBody;
  const results = await service.saveResults(
    Number(req.params.id),
    body,
    requireUser(req),
    getAuditContext(req),
  );

  return sendSuccess(res, results, 'Results saved successfully');
});

export const statistics = asyncHandler(async (req: Request, res: Response) => {
  const stats = await service.statistics(Number(req.params.id));

  return sendSuccess(res, stats, 'Assessment statistics loaded successfully');
});

export const pendingGrading = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  if (!user.teacherId) {
    throw AppError.notFound('No teacher profile is linked to this account', 'TEACHER_NOT_FOUND');
  }

  const year = await academicYearService.requireActiveYear();
  const assessments = await service.listPendingGrading(user.teacherId, year.id);

  return sendSuccess(res, assessments, 'Pending grade entry loaded successfully');
});
