import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { hasPermission } from '../../middleware/role.middleware';
import { PERMISSIONS } from '../../config/permissions';
import { resolvePagination } from '../../utils/pagination';
import { getAuditContext, requireUser } from '../../utils/request-context';
import type {
  CreateAnnouncementBody,
  ListAnnouncementsQuery,
  UpdateAnnouncementBody,
} from './announcement.schema';
import * as service from './announcement.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAnnouncementsQuery;
  const user = requireUser(req);
  const pagination = resolvePagination(query.page, query.limit);

  // Anyone who cannot manage announcements only sees the published ones
  // addressed to them.
  const canManage = hasPermission(user, PERMISSIONS.ANNOUNCEMENTS_MANAGE);

  const result = await service.list(
    canManage
      ? {
          search: query.search,
          status: query.status,
          audience: query.audience,
          classId: query.classId,
          gradeLevelId: query.gradeLevelId,
        }
      : { search: query.search, forUserId: user.id },
    pagination,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Announcements loaded successfully',
  );
});

/** The published feed for the signed-in user, used by the dashboards. */
export const feed = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = req.query as unknown as ListAnnouncementsQuery;
  const pagination = resolvePagination(query.page, query.limit ?? 10);

  await service.releaseScheduled();

  const result = await service.list({ forUserId: user.id }, pagination);

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Announcements loaded successfully',
  );
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await service.getById(Number(req.params.id));

  return sendSuccess(res, announcement, 'Announcement loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateAnnouncementBody;
  const announcement = await service.create(body, getAuditContext(req));

  return sendCreated(res, announcement, 'Announcement created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateAnnouncementBody;
  const announcement = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, announcement, 'Announcement updated successfully');
});

export const publish = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await service.publish(Number(req.params.id), getAuditContext(req));

  return sendSuccess(res, announcement, 'Announcement published successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await service.archive(Number(req.params.id), getAuditContext(req));

  return sendSuccess(res, announcement, 'Announcement archived successfully');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.remove(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Announcement deleted successfully');
});
