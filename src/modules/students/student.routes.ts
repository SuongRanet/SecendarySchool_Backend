import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './student.controller';
import {
  createStudentAccountSchema,
  createStudentSchema,
  linkParentSchema,
  listStudentsQuerySchema,
  studentParentParamSchema,
  updateStudentSchema,
} from './student.schema';

const router = Router();

router.use(authenticate);

// `students.view_own` lets a parent or student reach these routes; the service
// layer then narrows the result to the records they are allowed to see.
const canRead = requirePermissions(PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.STUDENTS_VIEW_OWN);

router.get('/', canRead, validate({ query: listStudentsQuerySchema }), controller.list);

router.get(
  '/stats/status',
  requirePermissions(PERMISSIONS.STUDENTS_VIEW),
  controller.statusBreakdown,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.STUDENTS_CREATE),
  validate({ body: createStudentSchema }),
  controller.create,
);

// The student portal. Declared before `/:id` so the literal path wins, and
// gated only by `students.view_own` because the student is read from the token.
const canReadOwn = requirePermissions(PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.STUDENTS_VIEW_OWN);

router.get('/me', canReadOwn, controller.getMe);
router.get('/me/enrollments', canReadOwn, controller.getMyEnrollments);
router.get('/me/enrollments/current', canReadOwn, controller.getMyCurrentEnrollment);

router.get('/:id', canRead, validate({ params: idParamSchema }), controller.getById);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.STUDENTS_UPDATE),
  validate({ params: idParamSchema, body: updateStudentSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.STUDENTS_ARCHIVE),
  validate({ params: idParamSchema }),
  controller.archive,
);

router.post(
  '/:id/restore',
  requirePermissions(PERMISSIONS.STUDENTS_ARCHIVE),
  validate({ params: idParamSchema }),
  controller.restore,
);

router.get('/:id/parents', canRead, validate({ params: idParamSchema }), controller.listParents);

router.post(
  '/:id/parents',
  requirePermissions(PERMISSIONS.PARENTS_LINK_STUDENTS),
  validate({ params: idParamSchema, body: linkParentSchema }),
  controller.linkParent,
);

router.delete(
  '/:id/parents/:parentId',
  requirePermissions(PERMISSIONS.PARENTS_LINK_STUDENTS),
  validate({ params: studentParentParamSchema }),
  controller.unlinkParent,
);

router.get(
  '/:id/enrollments',
  canRead,
  validate({ params: idParamSchema }),
  controller.listEnrollments,
);

router.get(
  '/:id/enrollments/current',
  canRead,
  validate({ params: idParamSchema }),
  controller.getCurrentEnrollment,
);

router.post(
  '/:id/account',
  requirePermissions(PERMISSIONS.USERS_CREATE),
  validate({ params: idParamSchema, body: createStudentAccountSchema }),
  controller.createAccount,
);

export default router;
