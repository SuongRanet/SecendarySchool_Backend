import type { Request, Response } from 'express';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuditContext } from '../../utils/request-context';
import type {
  CreateGradeLevelBody,
  ListGradeLevelsQuery,
  ReorderGradeLevelsBody,
  UpdateGradeLevelBody,
} from './grade-level.schema';
import * as service from './grade-level.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListGradeLevelsQuery;
  const gradeLevels = await service.list({ search: query.search, isActive: query.isActive });

  return sendSuccess(res, gradeLevels, 'Grade levels loaded successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const gradeLevel = await service.getById(Number(req.params.id));

  return sendSuccess(res, gradeLevel, 'Grade level loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateGradeLevelBody;
  const gradeLevel = await service.create(body, getAuditContext(req));

  return sendCreated(res, gradeLevel, 'Grade level created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateGradeLevelBody;
  const gradeLevel = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, gradeLevel, 'Grade level updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Grade level archived successfully');
});

export const reorder = asyncHandler(async (req: Request, res: Response) => {
  const { order } = req.body as ReorderGradeLevelsBody;
  const gradeLevels = await service.reorder(order, getAuditContext(req));

  return sendSuccess(res, gradeLevels, 'Grade levels reordered successfully');
});
