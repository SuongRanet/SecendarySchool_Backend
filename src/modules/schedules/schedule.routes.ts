import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './schedule.controller';
import {
  checkConflictsSchema,
  createScheduleSchema,
  listSchedulesQuerySchema,
  todayScheduleQuerySchema,
  updateScheduleSchema,
} from './schedule.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.SCHEDULES_VIEW),
  validate({ query: listSchedulesQuerySchema }),
  controller.list,
);

router.get(
  '/today',
  requirePermissions(PERMISSIONS.SCHEDULES_VIEW),
  validate({ query: todayScheduleQuerySchema }),
  controller.listToday,
);

router.post(
  '/check-conflicts',
  requirePermissions(PERMISSIONS.SCHEDULES_MANAGE),
  validate({ body: checkConflictsSchema }),
  controller.checkConflicts,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.SCHEDULES_MANAGE),
  validate({ body: createScheduleSchema }),
  controller.create,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.SCHEDULES_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.SCHEDULES_MANAGE),
  validate({ params: idParamSchema, body: updateScheduleSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.SCHEDULES_MANAGE),
  validate({ params: idParamSchema }),
  controller.remove,
);

export default router;
