import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as roleController from './role.controller';
import { updateRolePermissionsSchema, updateRoleSchema } from './role.schema';

const router = Router();

router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.ROLES_VIEW), roleController.list);

router.get(
  '/permissions',
  requirePermissions(PERMISSIONS.ROLES_VIEW),
  roleController.listPermissions,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.ROLES_VIEW),
  validate({ params: idParamSchema }),
  roleController.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.ROLES_MANAGE),
  validate({ params: idParamSchema, body: updateRoleSchema }),
  roleController.update,
);

router.put(
  '/:id/permissions',
  requirePermissions(PERMISSIONS.ROLES_MANAGE),
  validate({ params: idParamSchema, body: updateRolePermissionsSchema }),
  roleController.updatePermissions,
);

export default router;
