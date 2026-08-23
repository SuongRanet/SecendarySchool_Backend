import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { AuthenticatedUser, RoleCode, UserStatus } from '../../types';

interface PrincipalRow {
  id: number;
  username: string;
  email: string;
  status: UserStatus;
  roles: RoleCode[];
  permissions: string[];
  teacher_id: number | null;
  student_id: number | null;
  parent_id: number | null;
}

/**
 * Loads the authenticated principal: identity, roles, the flattened permission
 * set granted by those roles, and the ids of any domain profiles. This is what
 * every authorization decision in the backend is based on.
 */
export const findPrincipalById = async (
  userId: number,
  executor: Queryable = pool,
): Promise<AuthenticatedUser | null> => {
  const result = await executor.query<PrincipalRow>(
    `SELECT u.id,
            u.username,
            u.email,
            u.status,
            COALESCE(
              (SELECT ARRAY_AGG(DISTINCT r.code)
                 FROM user_roles ur
                 JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id),
              ARRAY[]::varchar[]
            ) AS roles,
            COALESCE(
              (SELECT ARRAY_AGG(DISTINCT p.code)
                 FROM user_roles ur
                 JOIN role_permissions rp ON rp.role_id = ur.role_id
                 JOIN permissions p ON p.id = rp.permission_id
                WHERE ur.user_id = u.id),
              ARRAY[]::varchar[]
            ) AS permissions,
            (SELECT t.id FROM teachers t WHERE t.user_id = u.id AND t.deleted_at IS NULL) AS teacher_id,
            (SELECT s.id FROM students s WHERE s.user_id = u.id AND s.deleted_at IS NULL) AS student_id,
            (SELECT p2.id FROM parents p2 WHERE p2.user_id = u.id AND p2.deleted_at IS NULL) AS parent_id
       FROM users u
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    status: row.status,
    roles: row.roles ?? [],
    permissions: row.permissions ?? [],
    teacherId: row.teacher_id,
    studentId: row.student_id,
    parentId: row.parent_id,
  };
};

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------

export interface RefreshTokenRow {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export const insertRefreshToken = async (
  input: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  },
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.userId, input.tokenHash, input.expiresAt, input.userAgent, input.ipAddress],
  );
};

export const findRefreshTokenByHash = async (
  tokenHash: string,
  executor: Queryable = pool,
): Promise<RefreshTokenRow | null> => {
  const result = await executor.query<RefreshTokenRow>(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  );

  return result.rows[0] ?? null;
};

export const revokeRefreshToken = async (
  tokenHash: string,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [tokenHash],
  );
};

export const revokeAllRefreshTokensForUser = async (
  userId: number,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
};

export const deleteExpiredRefreshTokens = async (executor: Queryable = pool): Promise<number> => {
  const result = await executor.query(
    'DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked_at IS NOT NULL',
  );

  return result.rowCount ?? 0;
};

// ---------------------------------------------------------------------------
// Password reset tokens
// ---------------------------------------------------------------------------

export interface OneTimeTokenRow {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export const insertPasswordResetToken = async (
  input: { userId: number; tokenHash: string; expiresAt: Date },
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [input.userId, input.tokenHash, input.expiresAt],
  );
};

export const findPasswordResetToken = async (
  tokenHash: string,
  executor: Queryable = pool,
): Promise<OneTimeTokenRow | null> => {
  const result = await executor.query<OneTimeTokenRow>(
    'SELECT * FROM password_reset_tokens WHERE token_hash = $1',
    [tokenHash],
  );

  return result.rows[0] ?? null;
};

export const markPasswordResetTokenUsed = async (
  id: number,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [id]);
};

export const invalidatePasswordResetTokens = async (
  userId: number,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
    [userId],
  );
};

// ---------------------------------------------------------------------------
// Email verification tokens
// ---------------------------------------------------------------------------

export const insertVerificationToken = async (
  input: { userId: number; tokenHash: string; expiresAt: Date },
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [input.userId, input.tokenHash, input.expiresAt],
  );
};

export const findVerificationToken = async (
  tokenHash: string,
  executor: Queryable = pool,
): Promise<OneTimeTokenRow | null> => {
  const result = await executor.query<OneTimeTokenRow>(
    'SELECT * FROM email_verification_tokens WHERE token_hash = $1',
    [tokenHash],
  );

  return result.rows[0] ?? null;
};

export const markVerificationTokenUsed = async (
  id: number,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1', [id]);
};
