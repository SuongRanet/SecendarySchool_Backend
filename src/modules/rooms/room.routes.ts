import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './room.controller';
import { createRoomSchema, listRoomsQuerySchema, updateRoomSchema } from './room.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.ROOMS_VIEW),
  validate({ query: listRoomsQuerySchema }),
  controller.list,
);

router.get('/options', requirePermissions(PERMISSIONS.ROOMS_VIEW), controller.listOptions);

router.post(
  '/',
  requirePermissions(PERMISSIONS.ROOMS_MANAGE),
  validate({ body: createRoomSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.ROOMS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.ROOMS_MANAGE),
  validate({ params: idParamSchema, body: updateRoomSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.ROOMS_MANAGE),
  validate({ params: idParamSchema }),
  controller.archive,
);

export default router;
