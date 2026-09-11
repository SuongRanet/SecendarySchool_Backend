import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './class.controller';
import {
  assignClassSubjectSchema,
  classStudentsQuerySchema,
  classSubjectParamSchema,
  createClassSchema,
  listClassesQuerySchema,
  replaceClassSubjectsSchema,
  updateClassSchema,
  classSubjectsQuerySchema,
} from './class.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.CLASSES_VIEW),
  validate({ query: listClassesQuerySchema }),
  controller.list,
);

router.get(
  '/options',
  requirePermissions(PERMISSIONS.CLASSES_VIEW),
  validate({ query: listClassesQuerySchema }),
  controller.listOptions,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.CLASSES_MANAGE),
  validate({ body: createClassSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.CLASSES_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.CLASSES_MANAGE),
  validate({ params: idParamSchema, body: updateClassSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.CLASSES_MANAGE),
  validate({ params: idParamSchema }),
  controller.archive,
);

router.get(
  '/:id/subjects',
  requirePermissions(PERMISSIONS.CLASSES_VIEW),
  validate({ params: idParamSchema, query: classSubjectsQuerySchema }),
  controller.listSubjects,
);

router.post(
  '/:id/subjects',
  requirePermissions(PERMISSIONS.CLASSES_MANAGE, PERMISSIONS.TEACHERS_ASSIGN),
  validate({ params: idParamSchema, body: assignClassSubjectSchema }),
  controller.assignSubject,
);

router.put(
  '/:id/subjects',
  requirePermissions(PERMISSIONS.CLASSES_MANAGE),
  validate({ params: idParamSchema, body: replaceClassSubjectsSchema }),
  controller.replaceSubjects,
);

router.delete(
  '/:id/subjects/:classSubjectId',
  requirePermissions(PERMISSIONS.CLASSES_MANAGE),
  validate({ params: classSubjectParamSchema }),
  controller.removeSubject,
);

router.get(
  '/:id/students',
  requirePermissions(PERMISSIONS.CLASSES_VIEW, PERMISSIONS.STUDENTS_VIEW),
  validate({ params: idParamSchema, query: classStudentsQuerySchema }),
  controller.listStudents,
);

export default router;
