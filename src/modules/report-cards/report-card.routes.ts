import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './report-card.controller';
import {
  generateReportCardsSchema,
  listReportCardsQuerySchema,
  publishClassSchema,
  setReportCardStatusSchema,
  studentReportCardQuerySchema,
  updateReportCardSchema,
} from './report-card.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.REPORT_CARDS_VIEW),
  validate({ query: listReportCardsQuerySchema }),
  controller.list,
);

router.post(
  '/generate',
  requirePermissions(PERMISSIONS.REPORT_CARDS_GENERATE),
  validate({ body: generateReportCardsSchema }),
  controller.generate,
);

router.post(
  '/publish-class',
  requirePermissions(PERMISSIONS.REPORT_CARDS_PUBLISH),
  validate({ body: publishClassSchema }),
  controller.publishClass,
);

router.get(
  '/student/:studentId',
  requirePermissions(PERMISSIONS.REPORT_CARDS_VIEW),
  validate({
    params: z.object({ studentId: z.coerce.number().int().positive() }),
    query: studentReportCardQuerySchema,
  }),
  controller.getForStudent,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.REPORT_CARDS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.REPORT_CARDS_GENERATE),
  validate({ params: idParamSchema, body: updateReportCardSchema }),
  controller.update,
);

router.patch(
  '/:id/status',
  requirePermissions(PERMISSIONS.REPORT_CARDS_PUBLISH),
  validate({ params: idParamSchema, body: setReportCardStatusSchema }),
  controller.setStatus,
);

export default router;
