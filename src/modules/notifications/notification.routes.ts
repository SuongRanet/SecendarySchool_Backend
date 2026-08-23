import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './notification.controller';
import { listNotificationsQuerySchema, sendNotificationSchema } from './notification.controller';

const router = Router();

router.use(authenticate);

// Every signed-in user reads their own notifications.
router.get('/', validate({ query: listNotificationsQuerySchema }), controller.list);
router.get('/unread-count', controller.unreadCount);
router.post('/read-all', controller.markAllRead);
router.post('/:id/read', validate({ params: idParamSchema }), controller.markRead);
router.post('/:id/archive', validate({ params: idParamSchema }), controller.archive);

router.post(
  '/send',
  requirePermissions(PERMISSIONS.NOTIFICATIONS_SEND),
  validate({ body: sendNotificationSchema }),
  controller.send,
);

export default router;
