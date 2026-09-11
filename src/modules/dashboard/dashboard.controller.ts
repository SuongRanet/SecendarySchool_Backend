import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { requireUser } from '../../utils/request-context';
import * as service from './dashboard.service';

/**
 * `date` picks the day the attendance panel reports on, and defaults to today.
 *
 * It is validated as a calendar date rather than passed through, so a malformed
 * value fails at the edge instead of reaching a query as a cast that throws.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a real date');

export const dashboardQuerySchema = z.object({
  termId: z.coerce.number().int().positive().optional(),
  date: isoDate.optional(),
});

/** Kept for the routes that only take a term. */
export const termQuerySchema = dashboardQuerySchema;

export const admin = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof dashboardQuerySchema>;
  const data = await service.adminDashboard(query.date);

  return sendSuccess(res, data, 'Dashboard loaded successfully');
});

export const principal = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof dashboardQuerySchema>;
  const data = await service.principalDashboard(query.termId, query.date);

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
