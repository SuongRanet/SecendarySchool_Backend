import type { Request, Response } from 'express';
import { z } from 'zod';
import { booleanQuerySchema, paginationQuerySchema } from '../../schemas/common.schema';
import { NOTIFICATION_TYPES } from '../../types/enums';
import {
  buildPagination,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { resolvePagination } from '../../utils/pagination';
import { requireUser } from '../../utils/request-context';
import * as service from './notification.service';

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  isRead: booleanQuerySchema,
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

export const sendNotificationSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(2000).nullish(),
  actionUrl: z.string().trim().max(255).nullish(),
  userIds: z.array(z.coerce.number().int().positive()).max(1000).optional(),
  audience: z
    .object({
      scope: z.enum(['ALL', 'TEACHERS', 'PARENTS', 'STUDENTS', 'GRADE', 'CLASS']),
      gradeLevelId: z.coerce.number().int().positive().nullish(),
      classId: z.coerce.number().int().positive().nullish(),
    })
    .optional(),
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = req.query as unknown as z.infer<typeof listNotificationsQuerySchema>;
  const pagination = resolvePagination(query.page, query.limit);

  const result = await service.list(
    user.id,
    { isRead: query.isRead, type: query.type },
    pagination,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Notifications loaded successfully',
  );
});

export const unreadCount = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const unread = await service.unreadCount(user.id);

  return sendSuccess(
    res,
    // `count` is the whole-bell figure; `byType` lets a single request feed the
    // per-section badges as well.
    { count: unread.total, byType: unread.byType },
    'Unread count loaded successfully',
  );
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await service.markRead(Number(req.params.id), user.id);

  return sendNoContent(res, 'Notification marked as read');
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const count = await service.markAllRead(user.id);

  return sendSuccess(res, { updated: count }, 'All notifications marked as read');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await service.archive(Number(req.params.id), user.id);

  return sendNoContent(res, 'Notification archived');
});

export const send = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const body = req.body as z.infer<typeof sendNotificationSchema>;

  const delivered = await service.dispatch({
    type: body.type,
    title: body.title,
    body: body.body ?? null,
    actionUrl: body.actionUrl ?? null,
    createdBy: user.id,
    userIds: body.userIds,
    audience: body.audience
      ? {
          scope: body.audience.scope,
          gradeLevelId: body.audience.gradeLevelId ?? null,
          classId: body.audience.classId ?? null,
        }
      : undefined,
  });

  return sendCreated(res, { delivered }, `Notification sent to ${delivered} recipient(s)`);
});
