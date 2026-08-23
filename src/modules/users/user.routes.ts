import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as userController from './user.controller';
import {
  assignRolesSchema,
  createUserSchema,
  listUsersQuerySchema,
  resetUserPasswordSchema,
  updateUserSchema,
  updateUserStatusSchema,
} from './user.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.USERS_VIEW),
  validate({ query: listUsersQuerySchema }),
  userController.list,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.USERS_CREATE),
  validate({ body: createUserSchema }),
  userController.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.USERS_VIEW),
  validate({ params: idParamSchema }),
  userController.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.USERS_UPDATE),
  validate({ params: idParamSchema, body: updateUserSchema }),
  userController.update,
);

router.patch(
  '/:id/status',
  requirePermissions(PERMISSIONS.USERS_DISABLE),
  validate({ params: idParamSchema, body: updateUserStatusSchema }),
  userController.changeStatus,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.USERS_DISABLE),
  validate({ params: idParamSchema }),
  userController.archive,
);

router.put(
  '/:id/roles',
  requirePermissions(PERMISSIONS.USERS_ASSIGN_ROLES),
  validate({ params: idParamSchema, body: assignRolesSchema }),
  userController.assignRoles,
);

router.post(
  '/:id/reset-password',
  requirePermissions(PERMISSIONS.USERS_RESET_PASSWORD),
  validate({ params: idParamSchema, body: resetUserPasswordSchema }),
  userController.resetPassword,
);

export default router;
