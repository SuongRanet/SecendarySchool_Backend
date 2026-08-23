import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import * as controller from './dashboard.controller';
import { termQuerySchema } from './dashboard.controller';

const router = Router();

router.use(authenticate);

router.get('/admin', requirePermissions(PERMISSIONS.DASHBOARD_ADMIN), controller.admin);

router.get(
  '/principal',
  requirePermissions(PERMISSIONS.DASHBOARD_PRINCIPAL),
  validate({ query: termQuerySchema }),
  controller.principal,
);

router.get('/teacher', requirePermissions(PERMISSIONS.DASHBOARD_TEACHER), controller.teacher);
router.get('/parent', requirePermissions(PERMISSIONS.DASHBOARD_PARENT), controller.parent);
router.get('/student', requirePermissions(PERMISSIONS.DASHBOARD_STUDENT), controller.student);

export default router;
