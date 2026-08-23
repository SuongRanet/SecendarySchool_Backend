import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { resolvePagination } from '../../utils/pagination';
import { getAuditContext, requireUser } from '../../utils/request-context';
import * as academicYearService from '../academic-years/academic-year.service';
import type {
  CreateExamBody,
  ListExamsQuery,
  SaveExamResultsBody,
  UpcomingExamsQuery,
  UpdateExamBody,
} from './exam.schema';
import * as service from './exam.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListExamsQuery;
  const pagination = resolvePagination(query.page, query.limit);

  const result = await service.list(
    {
      search: query.search,
      academicYearId: query.academicYearId,
      termId: query.termId,
      classId: query.classId,
      subjectId: query.subjectId,
      type: query.type,
      dateFrom: query.dateFrom ?? undefined,
      dateTo: query.dateTo ?? undefined,
      upcomingOnly: query.upcomingOnly,
    },
    pagination,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Exams loaded successfully',
  );
});

export const listUpcoming = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as UpcomingExamsQuery;
  const academicYearId =
    query.academicYearId ?? (await academicYearService.requireActiveYear()).id;

  const exams = await service.listUpcoming(academicYearId, query.limit ?? 10, query.classId);

  return sendSuccess(res, exams, 'Upcoming exams loaded successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const exam = await service.getById(Number(req.params.id));

  return sendSuccess(res, exam, 'Exam loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateExamBody;
  const exam = await service.create(body, requireUser(req), getAuditContext(req));

  return sendCreated(res, exam, 'Exam created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateExamBody;
  const exam = await service.update(
    Number(req.params.id),
    body,
    requireUser(req),
    getAuditContext(req),
  );

  return sendSuccess(res, exam, 'Exam updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), requireUser(req), getAuditContext(req));

  return sendNoContent(res, 'Exam archived successfully');
});

export const listResults = asyncHandler(async (req: Request, res: Response) => {
  const results = await service.listResults(Number(req.params.id));

  return sendSuccess(res, results, 'Exam results loaded successfully');
});

export const saveResults = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SaveExamResultsBody;
  const results = await service.saveResults(
    Number(req.params.id),
    body.results,
    requireUser(req),
    getAuditContext(req),
  );

  return sendSuccess(res, results, 'Exam results saved successfully');
});
