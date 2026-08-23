import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { resolvePagination } from '../../utils/pagination';
import { getAuditContext } from '../../utils/request-context';
import { assertStudentReadAccess } from '../students/student.access';
import type {
  GenerateReportCardsBody,
  ListReportCardsQuery,
  PublishClassBody,
  SetReportCardStatusBody,
  StudentReportCardQuery,
  UpdateReportCardBody,
} from './report-card.schema';
import * as service from './report-card.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListReportCardsQuery;
  const pagination = resolvePagination(query.page, query.limit);

  if (query.studentId) {
    await assertStudentReadAccess(req, query.studentId);
  }

  const result = await service.list(
    {
      academicYearId: query.academicYearId,
      termId: query.termId,
      classId: query.classId,
      studentId: query.studentId,
      status: query.status,
    },
    pagination,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Report cards loaded successfully',
  );
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const reportCard = await service.getById(Number(req.params.id));
  await assertStudentReadAccess(req, reportCard.studentId);

  return sendSuccess(res, reportCard, 'Report card loaded successfully');
});

export const getForStudent = asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.studentId);
  await assertStudentReadAccess(req, studentId);

  const query = req.query as unknown as StudentReportCardQuery;
  const reportCard = await service.getForStudent(
    studentId,
    query.academicYearId,
    query.termId ?? null,
  );

  return sendSuccess(res, reportCard, 'Report card loaded successfully');
});

export const generate = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as GenerateReportCardsBody;
  const reportCards = await service.generate(body, getAuditContext(req));

  return sendCreated(res, reportCards, `Generated ${reportCards.length} report card(s)`);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateReportCardBody;
  const reportCard = await service.updateComments(
    Number(req.params.id),
    body,
    getAuditContext(req),
  );

  return sendSuccess(res, reportCard, 'Report card updated successfully');
});

export const setStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as SetReportCardStatusBody;
  const reportCard = await service.setStatus(Number(req.params.id), status, getAuditContext(req));

  return sendSuccess(res, reportCard, 'Report card status updated successfully');
});

export const publishClass = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as PublishClassBody;
  const count = await service.publishClass(body.classId, body.termId ?? null, getAuditContext(req));

  return sendSuccess(res, { published: count }, `Published ${count} report card(s)`);
});
