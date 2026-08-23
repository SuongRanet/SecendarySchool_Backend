import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { RoleCode } from '../../types';
import type { PermissionRow, RoleRow } from './role.types';

const ROLE_SELECT = `
  SELECT r.id,
         r.code,
         r.name,
         r.description,
         r.is_system,
         r.created_at,
         r.updated_at,
         COALESCE(
           (SELECT ARRAY_AGG(p.code ORDER BY p.code)
              FROM role_permissions rp
              JOIN permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = r.id),
           ARRAY[]::varchar[]
         ) AS permissions,
         (SELECT COUNT(*)::int
            FROM user_roles ur
            JOIN users u ON u.id = ur.user_id
           WHERE ur.role_id = r.id AND u.deleted_at IS NULL) AS user_count
    FROM roles r
`;

export const findAllRoles = async (): Promise<RoleRow[]> => {
  const result = await pool.query<RoleRow>(`${ROLE_SELECT} ORDER BY r.id ASC`);
  return result.rows;
};

export const findRoleById = async (id: number): Promise<RoleRow | null> => {
  const result = await pool.query<RoleRow>(`${ROLE_SELECT} WHERE r.id = $1`, [id]);
  return result.rows[0] ?? null;
};

export const findRoleByCode = async (
  code: RoleCode,
  executor: Queryable = pool,
): Promise<RoleRow | null> => {
  const result = await executor.query<RoleRow>(`${ROLE_SELECT} WHERE r.code = $1`, [code]);
  return result.rows[0] ?? null;
};

export const findAllPermissions = async (): Promise<PermissionRow[]> => {
  const result = await pool.query<PermissionRow>(
    'SELECT id, code, name, module, description FROM permissions ORDER BY module ASC, code ASC',
  );

  return result.rows;
};

export const findPermissionIdsByCodes = async (
  codes: readonly string[],
  executor: Queryable = pool,
): Promise<{ id: number; code: string }[]> => {
  const result = await executor.query<{ id: number; code: string }>(
    'SELECT id, code FROM permissions WHERE code = ANY($1::varchar[])',
    [codes],
  );

  return result.rows;
};

export const replaceRolePermissions = async (
  roleId: number,
  permissionIds: readonly number[],
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

  if (permissionIds.length === 0) {
    return;
  }

  await executor.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, permission_id FROM UNNEST($2::bigint[]) AS permission_id`,
    [roleId, permissionIds],
  );
};

export const updateRoleDetails = async (
  id: number,
  input: { name?: string; description?: string | null },
  executor: Queryable = pool,
): Promise<void> => {
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    params.push(input.name);
    assignments.push(`name = $${params.length}`);
  }

  if (input.description !== undefined) {
    params.push(input.description);
    assignments.push(`description = $${params.length}`);
  }

  if (assignments.length === 0) {
    return;
  }

  params.push(id);

  await executor.query(`UPDATE roles SET ${assignments.join(', ')} WHERE id = $${params.length}`, params);
};
