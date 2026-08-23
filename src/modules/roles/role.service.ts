import { withTransaction } from '../../database/connection';
import type { AuditContext } from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as roleRepository from './role.repository';
import type { PermissionGroupDto, PermissionRow, RoleDto, RoleRow } from './role.types';

const toRoleDto = (row: RoleRow): RoleDto => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description,
  isSystem: row.is_system,
  permissions: row.permissions ?? [],
  userCount: row.user_count,
});

const toPermissionDto = (row: PermissionRow) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  module: row.module,
  description: row.description,
});

export const list = async (): Promise<RoleDto[]> => {
  const rows = await roleRepository.findAllRoles();
  return rows.map(toRoleDto);
};

export const getById = async (id: number): Promise<RoleDto> => {
  const row = await roleRepository.findRoleById(id);

  if (!row) {
    throw AppError.notFound('Role not found', 'ROLE_NOT_FOUND');
  }

  return toRoleDto(row);
};

/** Permissions grouped by module so the UI can render one section per module. */
export const listPermissions = async (): Promise<PermissionGroupDto[]> => {
  const rows = await roleRepository.findAllPermissions();
  const groups = new Map<string, PermissionGroupDto>();

  for (const row of rows) {
    const group = groups.get(row.module) ?? { module: row.module, permissions: [] };
    group.permissions.push(toPermissionDto(row));
    groups.set(row.module, group);
  }

  return [...groups.values()];
};

export const updatePermissions = async (
  id: number,
  permissionCodes: string[],
  context: AuditContext,
): Promise<RoleDto> => {
  const role = await roleRepository.findRoleById(id);

  if (!role) {
    throw AppError.notFound('Role not found', 'ROLE_NOT_FOUND');
  }

  if (role.code === 'SUPER_ADMIN') {
    throw AppError.forbidden(
      'The super administrator role always holds every permission',
      'SUPER_ADMIN_IMMUTABLE',
    );
  }

  const permissions = await roleRepository.findPermissionIdsByCodes(permissionCodes);

  if (permissions.length !== permissionCodes.length) {
    const found = new Set(permissions.map((permission) => permission.code));
    const missing = permissionCodes.filter((code) => !found.has(code));

    throw AppError.badRequest(
      `Unknown permission(s): ${missing.join(', ')}`,
      'UNKNOWN_PERMISSION',
    );
  }

  await withTransaction(async (client) => {
    await roleRepository.replaceRolePermissions(
      id,
      permissions.map((permission) => permission.id),
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'role',
        entityId: id,
        description: `Updated permissions of role ${role.code}`,
        oldValue: { permissions: role.permissions ?? [] },
        newValue: { permissions: permissionCodes },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

export const updateDetails = async (
  id: number,
  input: { name?: string; description?: string | null },
  context: AuditContext,
): Promise<RoleDto> => {
  const role = await roleRepository.findRoleById(id);

  if (!role) {
    throw AppError.notFound('Role not found', 'ROLE_NOT_FOUND');
  }

  const { oldValue, newValue } = auditService.diff(
    { name: role.name, description: role.description },
    input,
  );

  if (Object.keys(newValue).length === 0) {
    return toRoleDto(role);
  }

  await withTransaction(async (client) => {
    await roleRepository.updateRoleDetails(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'role',
        entityId: id,
        description: `Updated role ${role.code}`,
        oldValue,
        newValue,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};
