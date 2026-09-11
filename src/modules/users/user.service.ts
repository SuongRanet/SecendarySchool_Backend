import { withTransaction } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type {
  AuditContext,
  PaginatedResult,
  PaginationParams,
  RoleCode,
  SortParams,
  UserStatus,
} from '../../types';
import { AppError } from '../../utils/app-error';
import { generateTemporaryPassword, hashPassword } from '../../utils/password';
import * as auditService from '../audit/audit.service';
import * as authRepository from '../auth/auth.repository';
import * as userRepository from './user.repository';
import type { UserSortColumn } from './user.repository';
import type { CreateUserInput, UpdateUserInput, UserDto, UserFilters, UserListRow } from './user.types';

const toDto = (row: UserListRow): UserDto => ({
  id: row.id,
  username: row.username,
  email: row.email,
  status: row.status,
  emailVerifiedAt: row.email_verified_at,
  lastLoginAt: row.last_login_at,
  roles: row.roles ?? [],
  fullName: row.full_name,
  profileType: row.profile_type,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const assertUniqueCredentials = async (
  username: string | undefined,
  email: string | undefined,
  excludeUserId: number | undefined,
  executor?: Queryable,
): Promise<void> => {
  if (username && (await userRepository.usernameExists(username, excludeUserId, executor))) {
    throw AppError.conflict('This username is already taken', 'USERNAME_TAKEN');
  }

  if (email && (await userRepository.emailExists(email, excludeUserId, executor))) {
    throw AppError.conflict('This email is already registered', 'EMAIL_TAKEN');
  }
};

const resolveRoleIds = async (
  roleCodes: readonly RoleCode[],
  executor?: Queryable,
): Promise<number[]> => {
  const roles = await userRepository.findRolesByCodes(roleCodes, executor);

  if (roles.length !== roleCodes.length) {
    const found = new Set(roles.map((role) => role.code));
    const missing = roleCodes.filter((code) => !found.has(code));

    throw AppError.badRequest(`Unknown role(s): ${missing.join(', ')}`, 'UNKNOWN_ROLE');
  }

  return roles.map((role) => role.id);
};

export const list = async (
  filters: UserFilters,
  pagination: PaginationParams,
  sort: SortParams<UserSortColumn>,
): Promise<PaginatedResult<UserDto>> => {
  const result = await userRepository.findUsers(filters, pagination, sort);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const getById = async (id: number): Promise<UserDto> => {
  const row = await userRepository.findUserWithProfile(id);

  if (!row) {
    throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  }

  return toDto(row);
};

export const create = async (
  input: CreateUserInput,
  context: AuditContext,
): Promise<UserDto> => {
  await assertUniqueCredentials(input.username, input.email, undefined);

  const passwordHash = await hashPassword(input.password);

  const createdId = await withTransaction(async (client) => {
    const roleIds = await resolveRoleIds(input.roleCodes, client);

    const user = await userRepository.insertUser(
      {
        username: input.username,
        email: input.email,
        passwordHash,
        status: input.status ?? 'ACTIVE',
        createdBy: context.userId,
      },
      client,
    );

    await userRepository.replaceUserRoles(user.id, roleIds, context.userId, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'user',
        entityId: user.id,
        description: `Created user ${user.username}`,
        newValue: {
          username: user.username,
          email: user.email,
          status: user.status,
          roles: input.roleCodes,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return user.id;
  });

  return getById(createdId);
};

export const update = async (
  id: number,
  input: UpdateUserInput,
  context: AuditContext,
): Promise<UserDto> => {
  const existing = await userRepository.findUserById(id);

  if (!existing) {
    throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  }

  await assertUniqueCredentials(input.username, input.email, id);

  const { oldValue, newValue } = auditService.diff(
    { username: existing.username, email: existing.email, status: existing.status },
    input,
  );

  if (Object.keys(newValue).length === 0) {
    return getById(id);
  }

  await withTransaction(async (client) => {
    await userRepository.updateUser(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'user',
        entityId: id,
        description: `Updated user ${existing.username}`,
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

export const changeStatus = async (
  id: number,
  status: UserStatus,
  context: AuditContext,
): Promise<UserDto> => {
  const existing = await userRepository.findUserById(id);

  if (!existing) {
    throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  }

  if (existing.status === status) {
    return getById(id);
  }

  if (status !== 'ACTIVE') {
    await assertNotLastSuperAdmin(id);
  }

  await withTransaction(async (client) => {
    await userRepository.updateUserStatus(id, status, client);

    if (status !== 'ACTIVE') {
      await authRepository.revokeAllRefreshTokensForUser(id, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'user',
        entityId: id,
        description: `Changed status of ${existing.username} to ${status}`,
        oldValue: { status: existing.status },
        newValue: { status },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

const assertNotLastSuperAdmin = async (userId: number): Promise<void> => {
  const roles = await userRepository.findUserRoles(userId);
  const isSuperAdmin = roles.some((role) => role.code === 'SUPER_ADMIN');

  if (!isSuperAdmin) {
    return;
  }

  const activeSuperAdmins = await userRepository.countUsersWithRole('SUPER_ADMIN');

  if (activeSuperAdmins <= 1) {
    throw AppError.conflict(
      'The last active super administrator cannot be disabled or removed',
      'LAST_SUPER_ADMIN',
    );
  }
};

export const archive = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await userRepository.findUserById(id);

  if (!existing) {
    throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  }

  if (id === context.userId) {
    throw AppError.badRequest('You cannot archive your own account', 'SELF_ARCHIVE_FORBIDDEN');
  }

  await assertNotLastSuperAdmin(id);

  await withTransaction(async (client) => {
    await userRepository.softDeleteUser(id, client);
    await authRepository.revokeAllRefreshTokensForUser(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'user',
        entityId: id,
        description: `Archived user ${existing.username}`,
        oldValue: { status: existing.status, deletedAt: null },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const assignRoles = async (
  id: number,
  roleCodes: RoleCode[],
  context: AuditContext,
): Promise<UserDto> => {
  const existing = await userRepository.findUserById(id);

  if (!existing) {
    throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  }

  const previousRoles = (await userRepository.findUserRoles(id)).map((role) => role.code);
  const losesSuperAdmin = previousRoles.includes('SUPER_ADMIN') && !roleCodes.includes('SUPER_ADMIN');

  if (losesSuperAdmin) {
    await assertNotLastSuperAdmin(id);
  }

  await withTransaction(async (client) => {
    const roleIds = await resolveRoleIds(roleCodes, client);
    await userRepository.replaceUserRoles(id, roleIds, context.userId, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ASSIGN',
        entityType: 'user',
        entityId: id,
        description: `Updated roles of ${existing.username}`,
        oldValue: { roles: previousRoles },
        newValue: { roles: roleCodes },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

export const resetPassword = async (
  id: number,
  password: string | undefined,
  context: AuditContext,
): Promise<{ temporaryPassword: string | null }> => {
  const existing = await userRepository.findUserById(id);

  if (!existing) {
    throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  }

  const generated = password ? null : generateTemporaryPassword();
  const passwordHash = await hashPassword(password ?? (generated as string));

  await withTransaction(async (client) => {
    await userRepository.updatePasswordHash(id, passwordHash, client);
    await authRepository.revokeAllRefreshTokensForUser(id, client);
    await authRepository.invalidatePasswordResetTokens(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'PASSWORD_RESET',
        entityType: 'user',
        entityId: id,
        description: `Password reset for ${existing.username} by an administrator`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return { temporaryPassword: generated };
};
