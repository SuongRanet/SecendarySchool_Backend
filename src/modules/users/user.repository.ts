import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginationParams, PaginatedResult, RoleCode, SortParams, UserStatus } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import type { CreateUserInput, RoleSummary, UpdateUserInput, UserFilters, UserListRow, UserRow } from './user.types';

export const USER_SORT_COLUMNS = ['username', 'email', 'status', 'created_at', 'last_login_at'] as const;
export type UserSortColumn = (typeof USER_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<UserSortColumn, string> = {
  username: 'u.username',
  email: 'u.email',
  status: 'u.status',
  created_at: 'u.created_at',
  last_login_at: 'u.last_login_at',
};

/**
 * Resolves the display name and profile type of a user by looking at the three
 * domain profile tables. Identity stays in `users`; names live in the profiles.
 */
const PROFILE_JOIN = `
  LEFT JOIN teachers t ON t.user_id = u.id AND t.deleted_at IS NULL
  LEFT JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
  LEFT JOIN parents  p ON p.user_id = u.id AND p.deleted_at IS NULL
`;

const PROFILE_SELECT = `
  COALESCE(
    NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), ''),
    NULLIF(TRIM(CONCAT(s.first_name_en, ' ', s.last_name_en)), ''),
    NULLIF(TRIM(CONCAT(p.first_name_en, ' ', p.last_name_en)), '')
  ) AS full_name,
  CASE
    WHEN t.id IS NOT NULL THEN 'TEACHER'
    WHEN s.id IS NOT NULL THEN 'STUDENT'
    WHEN p.id IS NOT NULL THEN 'PARENT'
    ELSE NULL
  END AS profile_type,
  COALESCE(t.teacher_code, s.student_code, p.parent_code) AS profile_code
`;

const ROLES_SELECT = `
  COALESCE(
    (SELECT ARRAY_AGG(r.code ORDER BY r.code)
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id),
    ARRAY[]::varchar[]
  ) AS roles
`;

export const findUserById = async (
  id: number,
  executor: Queryable = pool,
): Promise<UserRow | null> => {
  const result = await executor.query<UserRow>(
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rows[0] ?? null;
};

export const findUserByUsernameOrEmail = async (
  identifier: string,
  executor: Queryable = pool,
): Promise<UserRow | null> => {
  const result = await executor.query<UserRow>(
    `SELECT * FROM users
      WHERE (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1))
        AND deleted_at IS NULL`,
    [identifier],
  );

  return result.rows[0] ?? null;
};

export const findUserByEmail = async (
  email: string,
  executor: Queryable = pool,
): Promise<UserRow | null> => {
  const result = await executor.query<UserRow>(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
    [email],
  );

  return result.rows[0] ?? null;
};

export const usernameExists = async (
  username: string,
  excludeUserId?: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const params: unknown[] = [username];
  let sql = 'SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL';

  if (excludeUserId !== undefined) {
    params.push(excludeUserId);
    sql += ` AND id <> $${params.length}`;
  }

  const result = await executor.query(sql, params);
  return result.rowCount !== null && result.rowCount > 0;
};

export const emailExists = async (
  email: string,
  excludeUserId?: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const params: unknown[] = [email];
  let sql = 'SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL';

  if (excludeUserId !== undefined) {
    params.push(excludeUserId);
    sql += ` AND id <> $${params.length}`;
  }

  const result = await executor.query(sql, params);
  return result.rowCount !== null && result.rowCount > 0;
};

export const insertUser = async (
  input: Omit<CreateUserInput, 'password' | 'roleCodes'> & { passwordHash: string; createdBy: number | null },
  executor: Queryable = pool,
): Promise<UserRow> => {
  const result = await executor.query<UserRow>(
    `INSERT INTO users (username, email, password_hash, status, created_by)
     VALUES ($1, $2, $3, COALESCE($4::user_status, 'PENDING_VERIFICATION'), $5)
     RETURNING *`,
    [input.username, input.email, input.passwordHash, input.status ?? null, input.createdBy],
  );

  return result.rows[0];
};

export const updateUser = async (
  id: number,
  input: UpdateUserInput,
  executor: Queryable = pool,
): Promise<UserRow | null> => {
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (input.username !== undefined) {
    params.push(input.username);
    assignments.push(`username = $${params.length}`);
  }

  if (input.email !== undefined) {
    params.push(input.email);
    assignments.push(`email = $${params.length}`);
  }

  if (input.status !== undefined) {
    params.push(input.status);
    assignments.push(`status = $${params.length}::user_status`);
  }

  if (assignments.length === 0) {
    return findUserById(id, executor);
  }

  params.push(id);

  const result = await executor.query<UserRow>(
    `UPDATE users SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL
      RETURNING *`,
    params,
  );

  return result.rows[0] ?? null;
};

export const updateUserStatus = async (
  id: number,
  status: UserStatus,
  executor: Queryable = pool,
): Promise<UserRow | null> => {
  const result = await executor.query<UserRow>(
    `UPDATE users SET status = $2::user_status
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [id, status],
  );

  return result.rows[0] ?? null;
};

export const updatePasswordHash = async (
  id: number,
  passwordHash: string,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
};

export const touchLastLogin = async (id: number, executor: Queryable = pool): Promise<void> => {
  await executor.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);
};

export const markEmailVerified = async (id: number, executor: Queryable = pool): Promise<void> => {
  await executor.query(
    `UPDATE users
        SET email_verified_at = NOW(),
            status = CASE WHEN status = 'PENDING_VERIFICATION' THEN 'ACTIVE'::user_status ELSE status END
      WHERE id = $1`,
    [id],
  );
};

export const softDeleteUser = async (id: number, executor: Queryable = pool): Promise<boolean> => {
  const result = await executor.query(
    `UPDATE users
        SET deleted_at = NOW(), status = 'INACTIVE'::user_status
      WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

export const restoreUser = async (id: number, executor: Queryable = pool): Promise<boolean> => {
  const result = await executor.query(
    `UPDATE users SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`,
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

export const findUsers = async (
  filters: UserFilters,
  pagination: PaginationParams,
  sort: SortParams<UserSortColumn>,
): Promise<PaginatedResult<UserListRow>> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!filters.includeDeleted) {
    conditions.push('u.deleted_at IS NULL');
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`u.status = $${params.length}::user_status`);
  }

  if (filters.roleCode) {
    params.push(filters.roleCode);
    conditions.push(
      `EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id AND r.code = $${params.length})`,
    );
  }

  if (filters.search) {
    params.push(buildSearchPattern(filters.search));
    conditions.push(
      `(u.username ILIKE $${params.length}
        OR u.email ILIKE $${params.length}
        OR CONCAT(t.first_name_en, ' ', t.last_name_en) ILIKE $${params.length}
        OR CONCAT(s.first_name_en, ' ', s.last_name_en) ILIKE $${params.length}
        OR CONCAT(p.first_name_en, ' ', p.last_name_en) ILIKE $${params.length})`,
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM users u ${PROFILE_JOIN} ${whereClause}`,
    params,
  );

  const listParams = [...params, pagination.limit, pagination.offset];

  const rowsResult = await pool.query<UserListRow>(
    `SELECT u.id, u.username, u.email, u.status, u.email_verified_at, u.last_login_at,
            u.created_by, u.created_at, u.updated_at, u.deleted_at,
            ${ROLES_SELECT},
            ${PROFILE_SELECT}
       FROM users u
       ${PROFILE_JOIN}
       ${whereClause}
      ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder}, u.id DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  return { rows: rowsResult.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findUserWithProfile = async (id: number): Promise<UserListRow | null> => {
  const result = await pool.query<UserListRow>(
    `SELECT u.id, u.username, u.email, u.status, u.email_verified_at, u.last_login_at,
            u.created_by, u.created_at, u.updated_at, u.deleted_at,
            ${ROLES_SELECT},
            ${PROFILE_SELECT}
       FROM users u
       ${PROFILE_JOIN}
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

// ---------------------------------------------------------------------------
// Role assignment
// ---------------------------------------------------------------------------

export const findRolesByCodes = async (
  codes: readonly RoleCode[],
  executor: Queryable = pool,
): Promise<RoleSummary[]> => {
  const result = await executor.query<RoleSummary>(
    'SELECT id, code, name FROM roles WHERE code = ANY($1::varchar[])',
    [codes],
  );

  return result.rows;
};

export const findUserRoles = async (
  userId: number,
  executor: Queryable = pool,
): Promise<RoleSummary[]> => {
  const result = await executor.query<RoleSummary>(
    `SELECT r.id, r.code, r.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY r.code`,
    [userId],
  );

  return result.rows;
};

export const replaceUserRoles = async (
  userId: number,
  roleIds: readonly number[],
  assignedBy: number | null,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

  if (roleIds.length === 0) {
    return;
  }

  await executor.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by)
     SELECT $1, role_id, $3 FROM UNNEST($2::bigint[]) AS role_id`,
    [userId, roleIds, assignedBy],
  );
};

export const addUserRole = async (
  userId: number,
  roleId: number,
  assignedBy: number | null,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId, assignedBy],
  );
};

export const removeUserRole = async (
  userId: number,
  roleId: number,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2', [
    userId,
    roleId,
  ]);
};

export const countUsersWithRole = async (
  roleCode: RoleCode,
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN users u ON u.id = ur.user_id
      WHERE r.code = $1 AND u.deleted_at IS NULL AND u.status = 'ACTIVE'`,
    [roleCode],
  );

  return result.rows[0]?.count ?? 0;
};
