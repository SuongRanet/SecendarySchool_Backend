import { withTransaction } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams } from '../../types';
import { AppError } from '../../utils/app-error';
import { logger } from '../../utils/logger';
import * as repository from './notification.repository';
import type {
  CreateNotificationInput,
  NotificationDto,
  NotificationFilters,
  NotificationRow,
} from './notification.types';

const toDto = (row: NotificationRow): NotificationDto => ({
  id: row.id,
  recipientId: row.recipient_id,
  type: row.type,
  title: row.title,
  body: row.body,
  entityType: row.entity_type,
  entityId: row.entity_id,
  actionUrl: row.action_url,
  isRead: row.read_at !== null,
  readAt: row.read_at,
  createdAt: row.created_at,
});

/**
 * Creates a notification and fans it out to its recipients. Delivery must never
 * break the operation that triggered it, so outside a transaction a failure is
 * logged rather than thrown.
 */
export const dispatch = async (
  input: CreateNotificationInput,
  executor?: Queryable,
): Promise<number> => {
  const run = async (client: Queryable): Promise<number> => {
    const notificationId = await repository.insertNotification(
      {
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        actionUrl: input.actionUrl ?? null,
        createdBy: input.createdBy ?? null,
      },
      client,
    );

    const userIds = input.userIds
      ? input.userIds
      : input.audience
        ? await repository.resolveAudience(input.audience, client)
        : [];

    return repository.addRecipients(notificationId, userIds, client);
  };

  if (executor) {
    return run(executor);
  }

  try {
    return await withTransaction(run);
  } catch (error) {
    logger.error('Failed to dispatch notification', { input, error });
    return 0;
  }
};

/** Notifies the guardians of a student, e.g. about an absence or a new grade. */
export const notifyGuardians = async (
  studentId: number,
  input: Omit<CreateNotificationInput, 'userIds' | 'audience'>,
  executor?: Queryable,
): Promise<number> => {
  const userIds = await repository.findGuardianUserIds(studentId, executor);

  if (userIds.length === 0) {
    return 0;
  }

  return dispatch({ ...input, userIds }, executor);
};

export const list = async (
  userId: number,
  filters: NotificationFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<NotificationDto>> => {
  const result = await repository.findForUser(userId, filters, pagination);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const unreadCount = async (
  userId: number,
): Promise<{ total: number; byType: Record<string, number> }> =>
  repository.countUnread(userId);

export const markRead = async (recipientId: number, userId: number): Promise<void> => {
  const updated = await repository.markRead(recipientId, userId);

  if (!updated) {
    throw AppError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
  }
};

export const markAllRead = async (userId: number): Promise<number> =>
  repository.markAllRead(userId);

export const archive = async (recipientId: number, userId: number): Promise<void> => {
  const updated = await repository.archive(recipientId, userId);

  if (!updated) {
    throw AppError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
  }
};

/**
 * Tells the teacher who set a piece of work that a pupil has handed it in.
 *
 * Homework only works as a conversation if it travels both ways. Publishing an
 * assignment already reached the class, but a submission reached nobody: the
 * teacher had to open each assignment and count what had arrived, which is how
 * marking gets forgotten.
 */
export const notifyTeacher = async (
  teacherId: number | null,
  input: Omit<CreateNotificationInput, 'userIds' | 'audience'>,
  executor?: Queryable,
): Promise<number> => {
  if (!teacherId) {
    return 0;
  }

  const userIds = await repository.findTeacherUserId(teacherId, executor);

  return userIds.length === 0 ? 0 : dispatch({ ...input, userIds }, executor);
};

/** Tells one pupil about their own work — a mark, or feedback on a submission. */
export const notifyStudent = async (
  studentId: number,
  input: Omit<CreateNotificationInput, 'userIds' | 'audience'>,
  executor?: Queryable,
): Promise<number> => {
  const userIds = await repository.findStudentUserId(studentId, executor);

  return userIds.length === 0 ? 0 : dispatch({ ...input, userIds }, executor);
};
