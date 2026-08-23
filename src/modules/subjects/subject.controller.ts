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
import { SUBJECT_SORT_COLUMNS } from './subject.repository';
import type {
  CreateSubjectBody,
  ListSubjectsQuery,
  SetSubjectActiveBody,
  UpdateSubjectBody,
} from './subject.schema';
import * as service from './subject.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListSubjectsQuery;
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, SUBJECT_SORT_COLUMNS, 'name_en');

  const result = await service.list(
    { search: query.search, isActive: query.isActive, gradeLevelId: query.gradeLevelId },
    pagination,
    { sortBy: sort.sortBy, sortOrder: query.sortOrder ? sort.sortOrder : 'ASC' },
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Subjects loaded successfully',
  );
});

export const listOptions = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListSubjectsQuery;
  const subjects = await service.listAll({ isActive: true, gradeLevelId: query.gradeLevelId });

  return sendSuccess(res, subjects, 'Subjects loaded successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const subject = await service.getById(Number(req.params.id));

  return sendSuccess(res, subject, 'Subject loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateSubjectBody;
  const subject = await service.create(body, getAuditContext(req));

  return sendCreated(res, subject, 'Subject created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateSubjectBody;
  const subject = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, subject, 'Subject updated successfully');
});

export const setActive = asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = req.body as SetSubjectActiveBody;
  const subject = await service.setActive(Number(req.params.id), isActive, getAuditContext(req));

  return sendSuccess(res, subject, 'Subject status updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Subject archived successfully');
});
