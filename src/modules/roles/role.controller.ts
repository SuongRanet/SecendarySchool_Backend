import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuditContext } from '../../utils/request-context';
import type { UpdateRoleBody, UpdateRolePermissionsBody } from './role.schema';
import * as roleService from './role.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const roles = await roleService.list();

  return sendSuccess(res, roles, 'Roles loaded successfully');
});

export const listPermissions = asyncHandler(async (_req: Request, res: Response) => {
  const permissions = await roleService.listPermissions();

  return sendSuccess(res, permissions, 'Permissions loaded successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const role = await roleService.getById(Number(req.params.id));

  return sendSuccess(res, role, 'Role loaded successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateRoleBody;
  const role = await roleService.updateDetails(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, role, 'Role updated successfully');
});

export const updatePermissions = asyncHandler(async (req: Request, res: Response) => {
  const { permissionCodes } = req.body as UpdateRolePermissionsBody;
  const role = await roleService.updatePermissions(
    Number(req.params.id),
    permissionCodes,
    getAuditContext(req),
  );

  return sendSuccess(res, role, 'Role permissions updated successfully');
});
