import type { PoolClient } from 'pg';
import {
  ALL_PERMISSION_CODES,
  PERMISSION_DEFINITIONS,
  ROLE_DEFINITIONS,
} from '../../config/permissions';
import { logger } from '../../utils/logger';

/** Inserts every role and permission and rebuilds the role → permission mapping. */
export const seedRolesAndPermissions = async (client: PoolClient): Promise<void> => {
  for (const permission of PERMISSION_DEFINITIONS) {
    await client.query(
      `INSERT INTO permissions (code, name, module)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, module = EXCLUDED.module`,
      [permission.code, permission.name, permission.module],
    );
  }

  logger.info(`Seeded ${PERMISSION_DEFINITIONS.length} permissions`);

  for (const role of ROLE_DEFINITIONS) {
    const result = await client.query<{ id: number }>(
      `INSERT INTO roles (code, name, description, is_system)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, description = EXCLUDED.description
       RETURNING id`,
      [role.code, role.name, role.description],
    );

    const roleId = result.rows[0].id;
    const codes = role.permissions === 'ALL' ? ALL_PERMISSION_CODES : role.permissions;

    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, p.id FROM permissions p WHERE p.code = ANY($2::varchar[])`,
      [roleId, codes],
    );
  }

  // A role that has been dropped from the catalogue is removed, but only when
  // nobody still holds it — an assigned role is kept and reported instead, so
  // retiring a role can never silently strip someone's access.
  const roleCodes = ROLE_DEFINITIONS.map((role) => role.code);

  const removed = await client.query<{ code: string }>(
    `DELETE FROM roles
      WHERE code <> ALL($1::text[])
        AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.role_id = roles.id)
      RETURNING code`,
    [roleCodes],
  );

  const stillAssigned = await client.query<{ code: string }>(
    `SELECT code FROM roles WHERE code <> ALL($1::text[])`,
    [roleCodes],
  );

  if (removed.rowCount) {
    logger.info(`Removed ${removed.rowCount} role(s) no longer in the catalogue: ${removed.rows.map((row) => row.code).join(', ')}`);
  }

  if (stillAssigned.rowCount) {
    logger.warn(
      `These roles are no longer in the catalogue but are still assigned to a user, so they were kept: ${stillAssigned.rows.map((row) => row.code).join(', ')}`,
    );
  }

  logger.info(`Seeded ${ROLE_DEFINITIONS.length} roles with their permissions`);
};
