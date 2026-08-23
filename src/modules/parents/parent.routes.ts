import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './parent.controller';
import {
  createParentAccountSchema,
  createParentSchema,
  linkChildSchema,
  listParentsQuerySchema,
  parentChildParamSchema,
  updateParentSchema,
} from './parent.schema';

const router = Router();

router.use(authenticate);

// Resolved from the token; available to any signed-in guardian.
router.get('/me', controller.getMe);
router.get('/me/children', controller.getMyChildren);

router.get(
  '/',
  requirePermissions(PERMISSIONS.PARENTS_VIEW),
  validate({ query: listParentsQuerySchema }),
  controller.list,
);

router.get(
  '/options',
  requirePermissions(PERMISSIONS.PARENTS_VIEW),
  validate({ query: listParentsQuerySchema }),
  controller.listOptions,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.PARENTS_CREATE),
  validate({ body: createParentSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.PARENTS_VIEW, PERMISSIONS.STUDENTS_VIEW_OWN),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.PARENTS_UPDATE),
  validate({ params: idParamSchema, body: updateParentSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.PARENTS_ARCHIVE),
  validate({ params: idParamSchema }),
  controller.archive,
);

router.get(
  '/:id/children',
  requirePermissions(PERMISSIONS.PARENTS_VIEW, PERMISSIONS.STUDENTS_VIEW_OWN),
  validate({ params: idParamSchema }),
  controller.listChildren,
);

router.post(
  '/:id/children',
  requirePermissions(PERMISSIONS.PARENTS_LINK_STUDENTS),
  validate({ params: idParamSchema, body: linkChildSchema }),
  controller.linkChild,
);

router.delete(
  '/:id/children/:studentId',
  requirePermissions(PERMISSIONS.PARENTS_LINK_STUDENTS),
  validate({ params: parentChildParamSchema }),
  controller.unlinkChild,
);

router.post(
  '/:id/account',
  requirePermissions(PERMISSIONS.USERS_CREATE),
  validate({ params: idParamSchema, body: createParentAccountSchema }),
  controller.createAccount,
);

export default router;
