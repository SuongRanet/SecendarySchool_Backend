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
import { ROOM_SORT_COLUMNS } from './room.repository';
import type { CreateRoomBody, ListRoomsQuery, UpdateRoomBody } from './room.schema';
import * as service from './room.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListRoomsQuery;
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, ROOM_SORT_COLUMNS, 'code');

  const result = await service.list(
    { search: query.search, building: query.building, isActive: query.isActive },
    pagination,
    sort,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Rooms loaded successfully',
  );
});

export const listOptions = asyncHandler(async (_req: Request, res: Response) => {
  const rooms = await service.listAll({ isActive: true });

  return sendSuccess(res, rooms, 'Rooms loaded successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const room = await service.getById(Number(req.params.id));

  return sendSuccess(res, room, 'Room loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateRoomBody;
  const room = await service.create(body, getAuditContext(req));

  return sendCreated(res, room, 'Room created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateRoomBody;
  const room = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, room, 'Room updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Room archived successfully');
});
