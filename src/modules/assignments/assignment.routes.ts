import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './assignment.controller';
import {
  createAssignmentSchema,
  gradeSubmissionsSchema,
  listAssignmentsQuerySchema,
  submitAssignmentSchema,
  updateAssignmentSchema,
} from './assignment.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_VIEW),
  validate({ query: listAssignmentsQuerySchema }),
  controller.list,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_MANAGE),
  validate({ body: createAssignmentSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_MANAGE),
  validate({ params: idParamSchema, body: updateAssignmentSchema }),
  controller.update,
);

router.post(
  '/:id/publish',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_MANAGE),
  validate({ params: idParamSchema }),
  controller.publish,
);

router.post(
  '/:id/close',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_MANAGE),
  validate({ params: idParamSchema }),
  controller.close,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_MANAGE),
  validate({ params: idParamSchema }),
  controller.archive,
);

router.get(
  '/:id/submissions',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_VIEW),
  validate({ params: idParamSchema }),
  controller.listSubmissions,
);

router.put(
  '/:id/submissions',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_GRADE),
  validate({ params: idParamSchema, body: gradeSubmissionsSchema }),
  controller.gradeSubmissions,
);

// The one write a student may perform. The service resolves the student from
// the token and rejects a submission for a class they are not enrolled in.
router.post(
  '/:id/submit',
  requirePermissions(PERMISSIONS.ASSIGNMENTS_SUBMIT),
  validate({ params: idParamSchema, body: submitAssignmentSchema }),
  controller.submit,
);

export default router;
