import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './teacher.controller';
import {
  assignSubjectsSchema,
  createTeacherAccountSchema,
  createTeacherSchema,
  listTeachersQuerySchema,
  teacherScopeQuerySchema,
  updateTeacherSchema,
} from './teacher.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.TEACHERS_VIEW),
  validate({ query: listTeachersQuerySchema }),
  controller.list,
);

router.get(
  '/options',
  requirePermissions(PERMISSIONS.TEACHERS_VIEW, PERMISSIONS.CLASSES_VIEW),
  validate({ query: listTeachersQuerySchema }),
  controller.listOptions,
);

// Available to any signed-in teacher; resolves from the token, not from a path id.
router.get('/me', controller.getMe);

router.get(
  '/me/assignments',
  validate({ query: teacherScopeQuerySchema }),
  controller.listMyAssignments,
);

router.get('/me/schedule', validate({ query: teacherScopeQuerySchema }), controller.listMySchedule);

router.post(
  '/',
  requirePermissions(PERMISSIONS.TEACHERS_CREATE),
  validate({ body: createTeacherSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.TEACHERS_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.TEACHERS_UPDATE),
  validate({ params: idParamSchema, body: updateTeacherSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.TEACHERS_ARCHIVE),
  validate({ params: idParamSchema }),
  controller.archive,
);

router.put(
  '/:id/subjects',
  requirePermissions(PERMISSIONS.TEACHERS_ASSIGN),
  validate({ params: idParamSchema, body: assignSubjectsSchema }),
  controller.assignSubjects,
);

router.get(
  '/:id/assignments',
  requirePermissions(PERMISSIONS.TEACHERS_VIEW),
  validate({ params: idParamSchema, query: teacherScopeQuerySchema }),
  controller.listAssignments,
);

router.get(
  '/:id/schedule',
  requirePermissions(PERMISSIONS.TEACHERS_VIEW, PERMISSIONS.SCHEDULES_VIEW),
  validate({ params: idParamSchema, query: teacherScopeQuerySchema }),
  controller.listSchedule,
);

router.post(
  '/:id/account',
  requirePermissions(PERMISSIONS.USERS_CREATE),
  validate({ params: idParamSchema, body: createTeacherAccountSchema }),
  controller.createAccount,
);

export default router;
