import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './announcement.controller';
import {
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
  updateAnnouncementSchema,
} from './announcement.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.ANNOUNCEMENTS_VIEW),
  validate({ query: listAnnouncementsQuerySchema }),
  controller.list,
);

router.get(
  '/feed',
  requirePermissions(PERMISSIONS.ANNOUNCEMENTS_VIEW),
  validate({ query: listAnnouncementsQuerySchema }),
  controller.feed,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.ANNOUNCEMENTS_MANAGE),
  validate({ body: createAnnouncementSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.ANNOUNCEMENTS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.ANNOUNCEMENTS_MANAGE),
  validate({ params: idParamSchema, body: updateAnnouncementSchema }),
  controller.update,
);

router.post(
  '/:id/publish',
  requirePermissions(PERMISSIONS.ANNOUNCEMENTS_PUBLISH),
  validate({ params: idParamSchema }),
  controller.publish,
);

router.post(
  '/:id/archive',
  requirePermissions(PERMISSIONS.ANNOUNCEMENTS_MANAGE),
  validate({ params: idParamSchema }),
  controller.archive,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.ANNOUNCEMENTS_MANAGE),
  validate({ params: idParamSchema }),
  controller.remove,
);

export default router;
