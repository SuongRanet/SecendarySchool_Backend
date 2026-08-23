import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './assessment.controller';
import {
  createAssessmentSchema,
  listAssessmentsQuerySchema,
  saveResultsSchema,
  setPublishedSchema,
  updateAssessmentSchema,
} from './assessment.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.ASSESSMENTS_VIEW),
  validate({ query: listAssessmentsQuerySchema }),
  controller.list,
);

router.get(
  '/pending-grading',
  requirePermissions(PERMISSIONS.ASSESSMENTS_GRADE),
  controller.pendingGrading,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.ASSESSMENTS_MANAGE),
  validate({ body: createAssessmentSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.ASSESSMENTS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.ASSESSMENTS_MANAGE),
  validate({ params: idParamSchema, body: updateAssessmentSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.ASSESSMENTS_MANAGE),
  validate({ params: idParamSchema }),
  controller.archive,
);

router.patch(
  '/:id/publish',
  requirePermissions(PERMISSIONS.ASSESSMENTS_MANAGE),
  validate({ params: idParamSchema, body: setPublishedSchema }),
  controller.setPublished,
);

router.get(
  '/:id/results',
  requirePermissions(PERMISSIONS.ASSESSMENTS_VIEW),
  validate({ params: idParamSchema }),
  controller.listResults,
);

router.put(
  '/:id/results',
  requirePermissions(PERMISSIONS.ASSESSMENTS_GRADE),
  validate({ params: idParamSchema, body: saveResultsSchema }),
  controller.saveResults,
);

router.get(
  '/:id/statistics',
  requirePermissions(PERMISSIONS.ASSESSMENTS_VIEW),
  validate({ params: idParamSchema }),
  controller.statistics,
);

export default router;
