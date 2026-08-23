import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './grade-level.controller';
import {
  createGradeLevelSchema,
  listGradeLevelsQuerySchema,
  reorderGradeLevelsSchema,
  updateGradeLevelSchema,
} from './grade-level.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.GRADE_LEVELS_VIEW),
  validate({ query: listGradeLevelsQuerySchema }),
  controller.list,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.GRADE_LEVELS_MANAGE),
  validate({ body: createGradeLevelSchema }),
  controller.create,
);

router.put(
  '/reorder',
  requirePermissions(PERMISSIONS.GRADE_LEVELS_MANAGE),
  validate({ body: reorderGradeLevelsSchema }),
  controller.reorder,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.GRADE_LEVELS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.GRADE_LEVELS_MANAGE),
  validate({ params: idParamSchema, body: updateGradeLevelSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.GRADE_LEVELS_MANAGE),
  validate({ params: idParamSchema }),
  controller.archive,
);

export default router;
