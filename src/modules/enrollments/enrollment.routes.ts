import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './enrollment.controller';
import {
  createEnrollmentSchema,
  enrollmentStatsQuerySchema,
  listEnrollmentsQuerySchema,
  promoteCohortSchema,
  transferEnrollmentSchema,
  updateEnrollmentSchema,
  withdrawEnrollmentSchema,
} from './enrollment.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.ENROLLMENTS_VIEW),
  validate({ query: listEnrollmentsQuerySchema }),
  controller.list,
);

router.get(
  '/stats/by-grade',
  requirePermissions(PERMISSIONS.ENROLLMENTS_VIEW),
  validate({ query: enrollmentStatsQuerySchema }),
  controller.statsByGrade,
);

router.get(
  '/stats/by-class',
  requirePermissions(PERMISSIONS.ENROLLMENTS_VIEW),
  validate({ query: enrollmentStatsQuerySchema }),
  controller.statsByClass,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.ENROLLMENTS_MANAGE),
  validate({ body: createEnrollmentSchema }),
  controller.create,
);

router.post(
  '/promote',
  requirePermissions(PERMISSIONS.ENROLLMENTS_MANAGE),
  validate({ body: promoteCohortSchema }),
  controller.promoteCohort,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.ENROLLMENTS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.ENROLLMENTS_MANAGE),
  validate({ params: idParamSchema, body: updateEnrollmentSchema }),
  controller.update,
);

router.post(
  '/:id/transfer',
  requirePermissions(PERMISSIONS.ENROLLMENTS_MANAGE),
  validate({ params: idParamSchema, body: transferEnrollmentSchema }),
  controller.transfer,
);

router.post(
  '/:id/withdraw',
  requirePermissions(PERMISSIONS.ENROLLMENTS_MANAGE),
  validate({ params: idParamSchema, body: withdrawEnrollmentSchema }),
  controller.withdraw,
);

export default router;
