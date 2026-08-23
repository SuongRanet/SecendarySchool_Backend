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
import { getAuditContext } from '../../utils/request-context';
import { ACADEMIC_YEAR_SORT_COLUMNS } from './academic-year.repository';
import type {
  CreateAcademicYearBody,
  CreateTermBody,
  ListAcademicYearsQuery,
  UpdateAcademicYearBody,
  UpdateTermBody,
} from './academic-year.schema';
import * as service from './academic-year.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAcademicYearsQuery;
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, ACADEMIC_YEAR_SORT_COLUMNS, 'start_date');

  const result = await service.list(
    { search: query.search, status: query.status },
    pagination,
    sort,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Academic years loaded successfully',
  );
});

/** Compact list used to populate academic year selectors. */
export const listOptions = asyncHandler(async (_req: Request, res: Response) => {
  const years = await service.listAll();

  return sendSuccess(res, years, 'Academic years loaded successfully');
});

export const getActive = asyncHandler(async (_req: Request, res: Response) => {
  const year = await service.getActive();

  return sendSuccess(res, year, 'Active academic year loaded successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const year = await service.getById(Number(req.params.id));

  return sendSuccess(res, year, 'Academic year loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateAcademicYearBody;
  const year = await service.create(body, getAuditContext(req));

  return sendCreated(res, year, 'Academic year created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateAcademicYearBody;
  const year = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, year, 'Academic year updated successfully');
});

export const setActive = asyncHandler(async (req: Request, res: Response) => {
  const year = await service.setActive(Number(req.params.id), getAuditContext(req));

  return sendSuccess(res, year, 'Active academic year updated successfully');
});

export const close = asyncHandler(async (req: Request, res: Response) => {
  const year = await service.close(Number(req.params.id), getAuditContext(req));

  return sendSuccess(res, year, 'Academic year closed successfully');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.remove(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Academic year deleted successfully');
});

export const listTerms = asyncHandler(async (req: Request, res: Response) => {
  const terms = await service.listTerms(Number(req.params.id));

  return sendSuccess(res, terms, 'Terms loaded successfully');
});

export const createTerm = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateTermBody;
  const term = await service.createTerm(Number(req.params.id), body, getAuditContext(req));

  return sendCreated(res, term, 'Term created successfully');
});

export const updateTerm = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateTermBody;
  const term = await service.updateTerm(Number(req.params.termId), body, getAuditContext(req));

  return sendSuccess(res, term, 'Term updated successfully');
});

export const setActiveTerm = asyncHandler(async (req: Request, res: Response) => {
  const term = await service.setActiveTerm(Number(req.params.termId), getAuditContext(req));

  return sendSuccess(res, term, 'Active term updated successfully');
});

export const removeTerm = asyncHandler(async (req: Request, res: Response) => {
  await service.removeTerm(Number(req.params.termId), getAuditContext(req));

  return sendNoContent(res, 'Term deleted successfully');
});
