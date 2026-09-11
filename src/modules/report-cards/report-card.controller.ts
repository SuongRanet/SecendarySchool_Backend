import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { AppError } from '../../utils/app-error';
import { resolvePagination } from '../../utils/pagination';
import { getAuditContext } from '../../utils/request-context';
import { isElevated } from '../../middleware/role.middleware';
import { requireUser } from '../../utils/request-context';
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

/**
 * A report card is a draft until the school publishes it. Staff work on drafts;
 * a family must never see one, or a mark still being checked reads as final.
 */
const isFamilyViewer = (req: Request): boolean => {
  const user = requireUser(req);

  return !isElevated(user) && Boolean(user.studentId ?? user.parentId) && !user.teacherId;
};

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListReportCardsQuery;
  const pagination = resolvePagination(query.page, query.limit);

  if (query.studentId) {
    await assertStudentReadAccess(req, query.studentId);
  }

  /**
   * Without a student in the query this endpoint would otherwise hand back
   * every report card in the school, so a guardian is pinned to their own
   * children and a student to themselves before the filters are read.
   */
  const user = requireUser(req);
  const scope: { studentId?: number; parentId?: number } = {};

  if (!isElevated(user)) {
    if (user.studentId) {
      scope.studentId = user.studentId;
    } else if (user.parentId) {
      scope.parentId = user.parentId;
    }
  }

  const result = await service.list(
    {
      academicYearId: query.academicYearId,
      termId: query.termId,
      classId: query.classId,
      studentId: scope.studentId ?? query.studentId,
      parentId: scope.parentId,
      status: isFamilyViewer(req) ? 'PUBLISHED' : query.status,
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

  if (reportCard.status !== 'PUBLISHED' && isFamilyViewer(req)) {
    throw AppError.notFound('Report card not found', 'REPORT_CARD_NOT_FOUND');
  }

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

  if (reportCard && reportCard.status !== 'PUBLISHED' && isFamilyViewer(req)) {
    return sendSuccess(res, null, 'Report card loaded successfully');
  }

  return sendSuccess(res, reportCard, 'Report card loaded successfully');
});

export const generate = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as GenerateReportCardsBody;
  const reportCards = await service.generate(body, requireUser(req), getAuditContext(req));

  return sendCreated(res, reportCards, `Generated ${reportCards.length} report card(s)`);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateReportCardBody;
  const reportCard = await service.updateComments(
    Number(req.params.id),
    body,
    requireUser(req),
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
