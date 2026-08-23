import type { Request, Response } from 'express';
import { z } from 'zod';
import { paginationQuerySchema } from '../../schemas/common.schema';
import { AUDIT_ACTIONS } from '../../types/enums';
import { buildPagination, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { resolvePagination, resolveSort } from '../../utils/pagination';
import { AUDIT_SORT_COLUMNS } from './audit.repository';
import * as service from './audit.service';

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  userId: z.coerce.number().int().positive().optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});

export const entityParamSchema = z.object({
  entityType: z.string().trim().min(1).max(60),
  entityId: z.coerce.number().int().positive(),
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof listAuditLogsQuerySchema>;
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, AUDIT_SORT_COLUMNS, 'created_at');

  const result = await service.list(
    {
      search: query.search,
      userId: query.userId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    },
    pagination,
    sort,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Audit logs loaded successfully',
  );
});

/** The change history of one record, shown on its detail page. */
export const listForEntity = asyncHandler(async (req: Request, res: Response) => {
  const { entityType, entityId } = req.params as unknown as z.infer<typeof entityParamSchema>;
  const entries = await service.listForEntity(entityType, Number(entityId));

  return sendSuccess(res, entries, 'Audit history loaded successfully');
});
