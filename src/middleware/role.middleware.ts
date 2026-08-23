import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ELEVATED_ROLES } from '../config/permissions';
import type { PermissionCode } from '../config/permissions';
import type { AuthenticatedUser, RoleCode } from '../types';
import { AppError } from '../utils/app-error';

export const hasRole = (user: AuthenticatedUser, ...roles: RoleCode[]): boolean =>
  roles.some((role) => user.roles.includes(role));

export const hasPermission = (user: AuthenticatedUser, ...permissions: string[]): boolean =>
  permissions.some((permission) => user.permissions.includes(permission));

/** SUPER_ADMIN, ADMIN and PRINCIPAL may act beyond their own assignments. */
export const isElevated = (user: AuthenticatedUser): boolean =>
  user.roles.some((role) => ELEVATED_ROLES.includes(role));

/** Allows the request when the user holds at least one of the listed roles. */
export const requireRoles =
  (...roles: RoleCode[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }

    if (!hasRole(req.user, ...roles)) {
      next(
        AppError.forbidden(
          'Your role does not allow this operation',
          'INSUFFICIENT_ROLE',
        ),
      );
      return;
    }

    next();
  };

/** Allows the request when the user holds at least one of the listed permissions. */
export const requirePermissions =
  (...permissions: PermissionCode[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }

    if (!hasPermission(req.user, ...permissions)) {
      next(
        AppError.forbidden(
          'You do not have permission to perform this action',
          'INSUFFICIENT_PERMISSION',
        ),
      );
      return;
    }

    next();
  };

/** Allows the request only when the user holds every listed permission. */
export const requireAllPermissions =
  (...permissions: PermissionCode[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }

    const missing = permissions.filter((permission) => !req.user!.permissions.includes(permission));

    if (missing.length > 0) {
      next(
        AppError.forbidden(
          'You do not have permission to perform this action',
          'INSUFFICIENT_PERMISSION',
        ),
      );
      return;
    }

    next();
  };
