import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './subject.controller';
import {
  createSubjectSchema,
  listSubjectsQuerySchema,
  setSubjectActiveSchema,
  updateSubjectSchema,
} from './subject.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.SUBJECTS_VIEW),
  validate({ query: listSubjectsQuerySchema }),
  controller.list,
);

router.get(
  '/options',
  requirePermissions(PERMISSIONS.SUBJECTS_VIEW),
  validate({ query: listSubjectsQuerySchema }),
  controller.listOptions,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.SUBJECTS_MANAGE),
  validate({ body: createSubjectSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.SUBJECTS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.SUBJECTS_MANAGE),
  validate({ params: idParamSchema, body: updateSubjectSchema }),
  controller.update,
);

router.patch(
  '/:id/status',
  requirePermissions(PERMISSIONS.SUBJECTS_MANAGE),
  validate({ params: idParamSchema, body: setSubjectActiveSchema }),
  controller.setActive,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.SUBJECTS_MANAGE),
  validate({ params: idParamSchema }),
  controller.archive,
);

export default router;
