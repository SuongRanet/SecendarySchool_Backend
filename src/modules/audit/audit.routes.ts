import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import * as controller from './audit.controller';
import { entityParamSchema, listAuditLogsQuerySchema } from './audit.controller';

const router = Router();

router.use(authenticate);
router.use(requirePermissions(PERMISSIONS.AUDIT_LOGS_VIEW));

router.get('/', validate({ query: listAuditLogsQuerySchema }), controller.list);

router.get(
  '/entity/:entityType/:entityId',
  validate({ params: entityParamSchema }),
  controller.listForEntity,
);

export default router;
