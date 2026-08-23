import type { Request, Response } from 'express';
import { buildPagination, sendCreated, sendNoContent, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { resolvePagination, resolveSort } from '../../utils/pagination';
import { getAuditContext } from '../../utils/request-context';
import { USER_SORT_COLUMNS } from './user.repository';
import type {
  AssignRolesBody,
  CreateUserBody,
  ListUsersQuery,
  ResetUserPasswordBody,
  UpdateUserBody,
  UpdateUserStatusBody,
} from './user.schema';
import * as userService from './user.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListUsersQuery;
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, USER_SORT_COLUMNS, 'created_at');

  const result = await userService.list(
    { search: query.search, status: query.status, roleCode: query.roleCode },
    pagination,
    sort,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Users loaded successfully',
  );
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getById(Number(req.params.id));

  return sendSuccess(res, user, 'User loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateUserBody;
  const user = await userService.create(body, getAuditContext(req));

  return sendCreated(res, user, 'User created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateUserBody;
  const user = await userService.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, user, 'User updated successfully');
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as UpdateUserStatusBody;
  const user = await userService.changeStatus(Number(req.params.id), status, getAuditContext(req));

  return sendSuccess(res, user, 'User status updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await userService.archive(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'User archived successfully');
});

export const assignRoles = asyncHandler(async (req: Request, res: Response) => {
  const { roleCodes } = req.body as AssignRolesBody;
  const user = await userService.assignRoles(Number(req.params.id), roleCodes, getAuditContext(req));

  return sendSuccess(res, user, 'Roles assigned successfully');
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body as ResetUserPasswordBody;
  const result = await userService.resetPassword(
    Number(req.params.id),
    password,
    getAuditContext(req),
  );

  return sendSuccess(res, result, 'Password reset successfully');
});
