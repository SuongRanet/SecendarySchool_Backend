import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './attendance.controller';
import {
  attendanceSheetQuerySchema,
  listAttendanceQuerySchema,
  missingAttendanceQuerySchema,
  recordAttendanceSchema,
  summaryQuerySchema,
  trendQuerySchema,
  updateAttendanceSchema,
} from './attendance.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.ATTENDANCE_VIEW),
  validate({ query: listAttendanceQuerySchema }),
  controller.list,
);

router.get('/reasons', requirePermissions(PERMISSIONS.ATTENDANCE_VIEW), controller.listReasons);

router.get(
  '/sheet',
  requirePermissions(PERMISSIONS.ATTENDANCE_VIEW),
  validate({ query: attendanceSheetQuerySchema }),
  controller.getSheet,
);

router.get(
  '/today',
  requirePermissions(PERMISSIONS.ATTENDANCE_VIEW),
  validate({ query: summaryQuerySchema }),
  controller.dayOverview,
);

router.get(
  '/missing',
  requirePermissions(PERMISSIONS.ATTENDANCE_VIEW),
  validate({ query: missingAttendanceQuerySchema }),
  controller.missing,
);

router.get(
  '/trend',
  requirePermissions(PERMISSIONS.ATTENDANCE_VIEW),
  validate({ query: trendQuerySchema }),
  controller.trend,
);

router.get(
  '/summary/student/:studentId',
  requirePermissions(PERMISSIONS.ATTENDANCE_VIEW),
  validate({
    params: z.object({ studentId: z.coerce.number().int().positive() }),
    query: summaryQuerySchema,
  }),
  controller.studentSummary,
);

router.get(
  '/summary/class/:classId',
  requirePermissions(PERMISSIONS.ATTENDANCE_VIEW),
  validate({
    params: z.object({ classId: z.coerce.number().int().positive() }),
    query: summaryQuerySchema,
  }),
  controller.classSummary,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.ATTENDANCE_RECORD),
  validate({ body: recordAttendanceSchema }),
  controller.record,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.ATTENDANCE_VIEW),
  validate({ params: idParamSchema }),
  controller.getById,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.ATTENDANCE_RECORD),
  validate({ params: idParamSchema, body: updateAttendanceSchema }),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.ATTENDANCE_UPDATE_ANY),
  validate({ params: idParamSchema }),
  controller.remove,
);

export default router;
