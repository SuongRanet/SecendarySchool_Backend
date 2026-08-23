import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { isElevated } from '../../middleware/role.middleware';
import { resolvePagination, resolveSort } from '../../utils/pagination';
import { AppError } from '../../utils/app-error';
import { getAuditContext, requireUser } from '../../utils/request-context';
import { PARENT_SORT_COLUMNS } from './parent.repository';
import type {
  CreateParentAccountBody,
  CreateParentBody,
  LinkChildBody,
  ListParentsQuery,
  UpdateParentBody,
} from './parent.schema';
import * as service from './parent.service';

/** A signed-in guardian may only read their own record. */
const assertParentReadAccess = (req: Request, parentId: number): void => {
  const user = requireUser(req);

  if (isElevated(user) || user.teacherId) {
    return;
  }

  if (user.parentId === parentId) {
    return;
  }

  throw AppError.forbidden('You do not have access to this guardian record', 'PARENT_ACCESS_DENIED');
};

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListParentsQuery;
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, PARENT_SORT_COLUMNS, 'first_name_en');

  const result = await service.list(
    {
      search: query.search,
      isActive: query.isActive,
      studentId: query.studentId,
      hasAccount: query.hasAccount,
      includeArchived: query.includeArchived,
    },
    pagination,
    { sortBy: sort.sortBy, sortOrder: query.sortOrder ? sort.sortOrder : 'ASC' },
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Guardians loaded successfully',
  );
});

export const listOptions = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListParentsQuery;
  const parents = await service.listAll({ search: query.search });

  return sendSuccess(res, parents, 'Guardians loaded successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const parentId = Number(req.params.id);
  assertParentReadAccess(req, parentId);

  const parent = await service.getById(parentId);

  return sendSuccess(res, parent, 'Guardian loaded successfully');
});

/** The signed-in guardian's own profile, used by the parent portal. */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  if (!user.parentId) {
    throw AppError.notFound('No guardian profile is linked to this account', 'PARENT_NOT_FOUND');
  }

  const parent = await service.getById(user.parentId);

  return sendSuccess(res, parent, 'Guardian profile loaded successfully');
});

/** The signed-in guardian's children — the entry point of the parent portal. */
export const getMyChildren = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  if (!user.parentId) {
    throw AppError.notFound('No guardian profile is linked to this account', 'PARENT_NOT_FOUND');
  }

  const children = await service.listChildren(user.parentId);

  return sendSuccess(res, children, 'Children loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateParentBody;
  const parent = await service.create(body, getAuditContext(req));

  return sendCreated(res, parent, 'Guardian created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateParentBody;
  const parent = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, parent, 'Guardian updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Guardian archived successfully');
});

export const listChildren = asyncHandler(async (req: Request, res: Response) => {
  const parentId = Number(req.params.id);
  assertParentReadAccess(req, parentId);

  const children = await service.listChildren(parentId);

  return sendSuccess(res, children, 'Children loaded successfully');
});

export const linkChild = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as LinkChildBody;
  const children = await service.linkChild(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, children, 'Child linked successfully');
});

export const unlinkChild = asyncHandler(async (req: Request, res: Response) => {
  await service.unlinkChild(
    Number(req.params.id),
    Number(req.params.studentId),
    getAuditContext(req),
  );

  return sendNoContent(res, 'Child unlinked successfully');
});

export const createAccount = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateParentAccountBody;
  const parent = await service.createAccount(Number(req.params.id), body, getAuditContext(req));

  return sendCreated(res, parent, 'Guardian account created successfully');
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const restored = await service.restore(Number(req.params.id), getAuditContext(req));

  return sendSuccess(res, restored, 'Guardian restored successfully');
});
