import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './grade.controller';
import {
  calculateGradesSchema,
  classAveragesQuerySchema,
  generateGradesSchema,
  listGradesQuerySchema,
  saveGradeSchema,
  saveManyGradesSchema,
  studentGradesQuerySchema,
  updateGradingSchemeSchema,
} from './grade.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.GRADES_VIEW),
  validate({ query: listGradesQuerySchema }),
  controller.list,
);

router.get('/schemes', requirePermissions(PERMISSIONS.GRADES_VIEW), controller.listSchemes);

router.patch(
  '/schemes/:id',
  requirePermissions(PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.GRADES_UPDATE_ANY),
  validate({ params: idParamSchema, body: updateGradingSchemeSchema }),
  controller.updateScheme,
);

router.get(
  '/performance',
  requirePermissions(PERMISSIONS.GRADES_VIEW),
  validate({ query: classAveragesQuerySchema }),
  controller.classAverages,
);

router.get(
  '/student/:studentId',
  requirePermissions(PERMISSIONS.GRADES_VIEW),
  validate({
    params: z.object({ studentId: z.coerce.number().int().positive() }),
    query: studentGradesQuerySchema,
  }),
  controller.listForStudent,
);

router.post(
  '/calculate',
  requirePermissions(PERMISSIONS.GRADES_ENTER),
  validate({ body: calculateGradesSchema }),
  controller.calculate,
);

router.post(
  '/generate',
  requirePermissions(PERMISSIONS.GRADES_ENTER),
  validate({ body: generateGradesSchema }),
  controller.generate,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.GRADES_ENTER),
  validate({ body: saveGradeSchema }),
  controller.save,
);

router.put(
  '/bulk',
  requirePermissions(PERMISSIONS.GRADES_ENTER),
  validate({ body: saveManyGradesSchema }),
  controller.saveMany,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.GRADES_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.get(
  '/:id/history',
  requirePermissions(PERMISSIONS.GRADES_VIEW),
  validate({ params: idParamSchema }),
  controller.history,
);

export default router;
