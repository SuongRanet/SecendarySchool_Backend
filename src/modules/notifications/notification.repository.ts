import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams } from '../../types';
import { ParamBuilder } from '../../utils/sql';
import type { NotificationFilters, NotificationRow } from './notification.types';

export const insertNotification = async (
  input: {
    type: string;
    title: string;
    body: string | null;
    entityType: string | null;
    entityId: number | null;
    actionUrl: string | null;
    createdBy: number | null;
  },
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO notifications (type, title, body, entity_type, entity_id, action_url, created_by)
     VALUES ($1::notification_type, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.type,
      input.title,
      input.body,
      input.entityType,
      input.entityId,
      input.actionUrl,
      input.createdBy,
    ],
  );

  return result.rows[0].id;
};

export const addRecipients = async (
  notificationId: number,
  userIds: readonly number[],
  executor: Queryable = pool,
): Promise<number> => {
  if (userIds.length === 0) {
    return 0;
  }

  const result = await executor.query(
    `INSERT INTO notification_recipients (notification_id, user_id)
     SELECT $1, user_id FROM UNNEST($2::bigint[]) AS user_id
     ON CONFLICT (notification_id, user_id) DO NOTHING`,
    [notificationId, userIds],
  );

  return result.rowCount ?? 0;
};

/**
 * Resolves an announcement audience into the user ids that should be notified.
 * Only accounts that actually exist and are active receive a notification.
 */
export const resolveAudience = async (
  audience: {
    scope: 'ALL' | 'TEACHERS' | 'PARENTS' | 'STUDENTS' | 'GRADE' | 'CLASS';
    gradeLevelId?: number | null;
    classId?: number | null;
  },
  executor: Queryable = pool,
): Promise<number[]> => {
  const teacherQuery = `
    SELECT t.user_id FROM teachers t
     WHERE t.user_id IS NOT NULL AND t.deleted_at IS NULL AND t.status = 'ACTIVE'
  `;

  const parentByClass = `
    SELECT DISTINCT p.user_id
      FROM parents p
      JOIN student_parents sp ON sp.parent_id = p.id
      JOIN enrollments e ON e.student_id = sp.student_id AND e.status = 'ACTIVE'
      JOIN classes c ON c.id = e.class_id
     WHERE p.user_id IS NOT NULL AND p.deleted_at IS NULL
  `;

  const studentByClass = `
    SELECT DISTINCT s.user_id
      FROM students s
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
      JOIN classes c ON c.id = e.class_id
     WHERE s.user_id IS NOT NULL AND s.deleted_at IS NULL
  `;

  let sql: string;
  const params: unknown[] = [];

  switch (audience.scope) {
    case 'TEACHERS':
      sql = teacherQuery;
      break;
    case 'PARENTS':
      sql = `SELECT p.user_id FROM parents p
              WHERE p.user_id IS NOT NULL AND p.deleted_at IS NULL AND p.is_active`;
      break;
    case 'STUDENTS':
      sql = `SELECT s.user_id FROM students s
              WHERE s.user_id IS NOT NULL AND s.deleted_at IS NULL AND s.status = 'ACTIVE'`;
      break;
    case 'GRADE':
      params.push(audience.gradeLevelId);
      sql = `${parentByClass} AND c.grade_level_id = $1
             UNION
             ${studentByClass} AND c.grade_level_id = $1`;
      break;
    case 'CLASS':
      params.push(audience.classId);
      sql = `${parentByClass} AND c.id = $1
             UNION
             ${studentByClass} AND c.id = $1
             UNION
             SELECT t.user_id FROM teachers t
               JOIN classes c2 ON c2.homeroom_teacher_id = t.id
              WHERE c2.id = $1 AND t.user_id IS NOT NULL AND t.deleted_at IS NULL`;
      break;
    case 'ALL':
    default:
      sql = `SELECT u.id AS user_id FROM users u
              WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE'`;
      break;
  }

  const result = await executor.query<{ user_id: number }>(
    `SELECT DISTINCT sub.user_id
       FROM (${sql}) AS sub
       JOIN users u ON u.id = sub.user_id
      WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE'`,
    params,
  );

  return result.rows.map((row) => row.user_id);
};

/** Guardians of one student — used for attendance alerts and new grades. */
export const findGuardianUserIds = async (
  studentId: number,
  executor: Queryable = pool,
): Promise<number[]> => {
  const result = await executor.query<{ user_id: number }>(
    `SELECT DISTINCT p.user_id
       FROM student_parents sp
       JOIN parents p ON p.id = sp.parent_id
       JOIN users u ON u.id = p.user_id
      WHERE sp.student_id = $1
        AND p.user_id IS NOT NULL
        AND p.deleted_at IS NULL
        AND u.status = 'ACTIVE'`,
    [studentId],
  );

  return result.rows.map((row) => row.user_id);
};

export const findForUser = async (
  userId: number,
  filters: NotificationFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<NotificationRow>> => {
  const builder = new ParamBuilder();
  const conditions = [
    `nr.user_id = ${builder.add(userId)}`,
    'nr.archived_at IS NULL',
  ];

  if (filters.isRead !== undefined) {
    conditions.push(filters.isRead ? 'nr.read_at IS NOT NULL' : 'nr.read_at IS NULL');
  }

  if (filters.type) {
    conditions.push(`n.type = ${builder.add(filters.type)}::notification_type`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM notification_recipients nr
       JOIN notifications n ON n.id = nr.notification_id
       ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<NotificationRow>(
    `SELECT nr.id AS recipient_id,
            n.id,
            n.type,
            n.title,
            n.body,
            n.entity_type,
            n.entity_id,
            n.action_url,
            nr.read_at,
            nr.archived_at,
            n.created_at
       FROM notification_recipients nr
       JOIN notifications n ON n.id = nr.notification_id
       ${where}
      ORDER BY n.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const countUnread = async (userId: number): Promise<number> => {
  const result = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM notification_recipients
      WHERE user_id = $1 AND read_at IS NULL AND archived_at IS NULL`,
    [userId],
  );

  return result.rows[0]?.count ?? 0;
};

export const markRead = async (recipientId: number, userId: number): Promise<boolean> => {
  const result = await pool.query(
    `UPDATE notification_recipients
        SET read_at = NOW()
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [recipientId, userId],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

export const markAllRead = async (userId: number): Promise<number> => {
  const result = await pool.query(
    `UPDATE notification_recipients
        SET read_at = NOW()
      WHERE user_id = $1 AND read_at IS NULL AND archived_at IS NULL`,
    [userId],
  );

  return result.rowCount ?? 0;
};

export const archive = async (recipientId: number, userId: number): Promise<boolean> => {
  const result = await pool.query(
    `UPDATE notification_recipients
        SET archived_at = NOW()
      WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
    [recipientId, userId],
  );

  return result.rowCount !== null && result.rowCount > 0;
};
