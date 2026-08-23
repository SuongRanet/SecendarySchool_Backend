import type { PoolClient } from 'pg';
import { env } from '../../config';
import { logger } from '../../utils/logger';
import { hashPassword } from '../../utils/password';

/**
 * Creates the bootstrap super administrator. An existing account is left alone so
 * a re-run of the seed never resets a password that has already been changed.
 */
export const seedSuperAdmin = async (client: PoolClient): Promise<void> => {
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
    [env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_EMAIL],
  );

  if (existing.rows.length > 0) {
    logger.info('Super administrator already exists; leaving the account untouched');
    return;
  }

  const passwordHash = await hashPassword(env.SEED_SUPER_ADMIN_PASSWORD);

  const inserted = await client.query<{ id: number }>(
    `INSERT INTO users (username, email, password_hash, status, email_verified_at)
     VALUES ($1, $2, $3, 'ACTIVE', NOW())
     RETURNING id`,
    [env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_EMAIL, passwordHash],
  );

  const userId = inserted.rows[0].id;

  await client.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE code = 'SUPER_ADMIN'
     ON CONFLICT DO NOTHING`,
    [userId],
  );

  logger.warn(
    `Created super administrator "${env.SEED_SUPER_ADMIN_USERNAME}". Change the password after the first sign-in.`,
  );
};
