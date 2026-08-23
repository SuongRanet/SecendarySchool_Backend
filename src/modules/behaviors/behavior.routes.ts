import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './behavior.controller';
import {
  behaviorSummaryQuerySchema,
  createBehaviorSchema,
  createCommentSchema,
  listBehaviorsQuerySchema,
  listCommentsQuerySchema,
  updateBehaviorSchema,
} from './behavior.schema';

const router = Router();

router.use(authenticate);

const studentParam = z.object({ studentId: z.coerce.number().int().positive() });

router.get(
  '/',
  requirePermissions(PERMISSIONS.BEHAVIORS_VIEW),
  validate({ query: listBehaviorsQuerySchema }),
  controller.list,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.BEHAVIORS_MANAGE),
  validate({ body: createBehaviorSchema }),
  controller.create,
);

router.get(
  '/summary/:studentId',
  requirePermissions(PERMISSIONS.BEHAVIORS_VIEW),
  validate({ params: studentParam, query: behaviorSummaryQuerySchema }),
  controller.summary,
);

router.get(
  '/comments/:studentId',
  requirePermissions(PERMISSIONS.BEHAVIORS_VIEW),
  validate({ params: studentParam, query: listCommentsQuerySchema }),
  controller.listComments,
);

router.post(
  '/comments',
  requirePermissions(PERMISSIONS.BEHAVIORS_MANAGE),
  validate({ body: createCommentSchema }),
  controller.createComment,
);

router.delete(
  '/comments/:id',
  requirePermissions(PERMISSIONS.BEHAVIORS_MANAGE),
  validate({ params: idParamSchema }),
  controller.removeComment,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.BEHAVIORS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.BEHAVIORS_MANAGE),
  validate({ params: idParamSchema, body: updateBehaviorSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.BEHAVIORS_MANAGE),
  validate({ params: idParamSchema }),
  controller.archive,
);

export default router;
