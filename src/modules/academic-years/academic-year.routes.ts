import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './academic-year.controller';
import {
  createAcademicYearSchema,
  createTermSchema,
  listAcademicYearsQuerySchema,
  termIdParamSchema,
  updateAcademicYearSchema,
  updateTermSchema,
} from './academic-year.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_VIEW),
  validate({ query: listAcademicYearsQuerySchema }),
  controller.list,
);

router.get('/options', requirePermissions(PERMISSIONS.ACADEMIC_YEARS_VIEW), controller.listOptions);
router.get('/active', requirePermissions(PERMISSIONS.ACADEMIC_YEARS_VIEW), controller.getActive);

router.post(
  '/',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_MANAGE),
  validate({ body: createAcademicYearSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_MANAGE),
  validate({ params: idParamSchema, body: updateAcademicYearSchema }),
  controller.update,
);

router.post(
  '/:id/activate',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_MANAGE),
  validate({ params: idParamSchema }),
  controller.setActive,
);

router.post(
  '/:id/close',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_CLOSE),
  validate({ params: idParamSchema }),
  controller.close,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_MANAGE),
  validate({ params: idParamSchema }),
  controller.remove,
);

// Terms live inside an academic year.
router.get(
  '/:id/terms',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_VIEW),
  validate({ params: idParamSchema }),
  controller.listTerms,
);

router.post(
  '/:id/terms',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_MANAGE),
  validate({ params: idParamSchema, body: createTermSchema }),
  controller.createTerm,
);

router.patch(
  '/:id/terms/:termId',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_MANAGE),
  validate({ params: termIdParamSchema, body: updateTermSchema }),
  controller.updateTerm,
);

router.post(
  '/:id/terms/:termId/activate',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_MANAGE),
  validate({ params: termIdParamSchema }),
  controller.setActiveTerm,
);

router.delete(
  '/:id/terms/:termId',
  requirePermissions(PERMISSIONS.ACADEMIC_YEARS_MANAGE),
  validate({ params: termIdParamSchema }),
  controller.removeTerm,
);

export default router;
