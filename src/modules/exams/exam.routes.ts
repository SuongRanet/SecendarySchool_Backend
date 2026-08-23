import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './exam.controller';
import {
  createExamSchema,
  listExamsQuerySchema,
  saveExamResultsSchema,
  upcomingExamsQuerySchema,
  updateExamSchema,
} from './exam.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.EXAMS_VIEW),
  validate({ query: listExamsQuerySchema }),
  controller.list,
);

router.get(
  '/upcoming',
  requirePermissions(PERMISSIONS.EXAMS_VIEW),
  validate({ query: upcomingExamsQuerySchema }),
  controller.listUpcoming,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.EXAMS_MANAGE),
  validate({ body: createExamSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.EXAMS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.EXAMS_MANAGE),
  validate({ params: idParamSchema, body: updateExamSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.EXAMS_MANAGE),
  validate({ params: idParamSchema }),
  controller.archive,
);

router.get(
  '/:id/results',
  requirePermissions(PERMISSIONS.EXAMS_VIEW),
  validate({ params: idParamSchema }),
  controller.listResults,
);

router.put(
  '/:id/results',
  requirePermissions(PERMISSIONS.EXAMS_MANAGE),
  validate({ params: idParamSchema, body: saveExamResultsSchema }),
  controller.saveResults,
);

export default router;
