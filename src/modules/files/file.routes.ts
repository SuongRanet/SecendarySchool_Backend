import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import * as controller from './file.controller';

const router = Router();

router.use(authenticate);

/**
 * Uploading a homework attachment.
 *
 * Both sides of the exchange land here: a student handing work in, and a
 * teacher attaching the brief. Either permission is enough, and the record the
 * file is later attached to is what decides who may read it back.
 */
router.post(
  '/homework',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_SUBMIT, PERMISSIONS.ASSIGNMENTS_MANAGE),
  controller.receiveHomeworkFile,
  controller.uploadHomeworkFile,
);

router.get(
  '/:folder/:filename',
  validate({
    params: z.object({
      folder: z.string().regex(/^[a-z-]+$/),
      filename: z.string().min(1).max(200),
    }),
  }),
  controller.downloadFile,
);

export default router;
