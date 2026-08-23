import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { requireUser } from '../../utils/request-context';
import * as service from './dashboard.service';

export const termQuerySchema = z.object({
  termId: z.coerce.number().int().positive().optional(),
});

export const admin = asyncHandler(async (_req: Request, res: Response) => {
  const data = await service.adminDashboard();

  return sendSuccess(res, data, 'Dashboard loaded successfully');
});

export const principal = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof termQuerySchema>;
  const data = await service.principalDashboard(query.termId);

  return sendSuccess(res, data, 'Dashboard loaded successfully');
});

export const teacher = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.teacherDashboard(requireUser(req));

  return sendSuccess(res, data, 'Dashboard loaded successfully');
});

export const parent = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.parentDashboard(requireUser(req));

  return sendSuccess(res, data, 'Dashboard loaded successfully');
});

export const student = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.studentDashboard(requireUser(req));

  return sendSuccess(res, data, 'Dashboard loaded successfully');
});
