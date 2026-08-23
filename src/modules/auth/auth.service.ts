import { randomUUID } from 'node:crypto';
import { env } from '../../config';
import { withTransaction } from '../../database/connection';
import { AppError } from '../../utils/app-error';
import {
  durationToDate,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt';
import { logger } from '../../utils/logger';
import { hashPassword, verifyPassword } from '../../utils/password';
import * as userRepository from '../users/user.repository';
import * as auditService from '../audit/audit.service';
import * as authRepository from './auth.repository';
import type { AuthProfile, AuthResult, AuthTokens, RequestMetadata } from './auth.types';

const buildTokens = async (
  userId: number,
  username: string,
  roles: string[],
  metadata: RequestMetadata,
): Promise<AuthTokens> => {
  const accessToken = signAccessToken({ sub: userId, username, roles });
  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: userId, jti });

  await authRepository.insertRefreshToken({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: durationToDate(env.JWT_REFRESH_EXPIRES_IN),
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress,
  });

  return { accessToken, refreshToken, expiresIn: env.JWT_EXPIRES_IN };
};

const loadProfile = async (userId: number): Promise<AuthProfile> => {
  const principal = await authRepository.findPrincipalById(userId);

  if (!principal) {
    throw AppError.unauthorized('Account no longer exists', 'ACCOUNT_NOT_FOUND');
  }

  const withProfile = await userRepository.findUserWithProfile(userId);

  return {
    id: principal.id,
    username: principal.username,
    email: principal.email,
    status: principal.status,
    roles: principal.roles,
    permissions: principal.permissions,
    fullName: withProfile?.full_name ?? null,
    profileType: withProfile?.profile_type ?? null,
    teacherId: principal.teacherId,
    studentId: principal.studentId,
    parentId: principal.parentId,
    lastLoginAt: withProfile?.last_login_at ?? null,
  };
};

/**
 * Authenticates a user. The same generic message is returned for an unknown
 * account and a wrong password so the endpoint cannot be used to enumerate users.
 */
export const login = async (
  identifier: string,
  password: string,
  metadata: RequestMetadata,
): Promise<AuthResult> => {
  const user = await userRepository.findUserByUsernameOrEmail(identifier);

  if (!user) {
    throw AppError.unauthorized('Invalid username or password', 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);

  if (!passwordMatches) {
    throw AppError.unauthorized('Invalid username or password', 'INVALID_CREDENTIALS');
  }

  if (user.status === 'PENDING_VERIFICATION') {
    throw AppError.forbidden(
      'This account has not been verified yet',
      'ACCOUNT_PENDING_VERIFICATION',
    );
  }

  if (user.status === 'SUSPENDED') {
    throw AppError.forbidden('This account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  if (user.status !== 'ACTIVE') {
    throw AppError.forbidden('This account is not active', 'ACCOUNT_NOT_ACTIVE');
  }

  await userRepository.touchLastLogin(user.id);

  const profile = await loadProfile(user.id);
  const tokens = await buildTokens(user.id, user.username, profile.roles, metadata);

  await auditService.record({
    userId: user.id,
    action: 'LOGIN',
    entityType: 'user',
    entityId: user.id,
    description: `${user.username} signed in`,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  });

  return { user: profile, tokens };
};

/**
 * Exchanges a refresh token for a new token pair. The presented token is revoked
 * as part of the exchange so a stolen refresh token cannot be replayed.
 */
export const refresh = async (
  refreshToken: string,
  metadata: RequestMetadata,
): Promise<AuthResult> => {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);
  const stored = await authRepository.findRefreshTokenByHash(tokenHash);

  if (!stored) {
    throw AppError.unauthorized('Refresh token is not recognised', 'INVALID_REFRESH_TOKEN');
  }

  if (stored.revoked_at) {
    // A revoked token being presented again means the token may have leaked.
    await authRepository.revokeAllRefreshTokensForUser(stored.user_id);
    throw AppError.unauthorized('Refresh token has been revoked', 'REFRESH_TOKEN_REVOKED');
  }

  if (stored.expires_at.getTime() < Date.now()) {
    throw AppError.unauthorized('Refresh token has expired', 'REFRESH_TOKEN_EXPIRED');
  }

  const user = await userRepository.findUserById(payload.sub);

  if (!user || user.status !== 'ACTIVE') {
    throw AppError.unauthorized('Account is not active', 'ACCOUNT_NOT_ACTIVE');
  }

  await authRepository.revokeRefreshToken(tokenHash);

  const profile = await loadProfile(user.id);
  const tokens = await buildTokens(user.id, user.username, profile.roles, metadata);

  return { user: profile, tokens };
};

export const logout = async (
  userId: number,
  refreshToken: string | undefined,
  metadata: RequestMetadata,
): Promise<void> => {
  if (refreshToken) {
    await authRepository.revokeRefreshToken(hashToken(refreshToken));
  } else {
    await authRepository.revokeAllRefreshTokensForUser(userId);
  }

  await auditService.record({
    userId,
    action: 'LOGOUT',
    entityType: 'user',
    entityId: userId,
    description: 'User signed out',
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  });
};

export const me = async (userId: number): Promise<AuthProfile> => loadProfile(userId);

/**
 * Starts the password reset flow. The response is identical whether or not the
 * email exists, so the endpoint cannot confirm which addresses are registered.
 * The generated token is returned only outside production, where no mail
 * transport is configured.
 */
export const forgotPassword = async (email: string): Promise<{ token?: string }> => {
  const user = await userRepository.findUserByEmail(email);

  if (!user || user.status === 'SUSPENDED') {
    return {};
  }

  const token = generateOpaqueToken();
  const expiresAt = durationToDate(`${env.PASSWORD_RESET_TOKEN_TTL_MINUTES}m`);

  await authRepository.invalidatePasswordResetTokens(user.id);
  await authRepository.insertPasswordResetToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  logger.info('Password reset token issued', { userId: user.id, expiresAt });

  return env.isProduction ? {} : { token };
};

export const resetPassword = async (
  token: string,
  newPassword: string,
  metadata: RequestMetadata,
): Promise<void> => {
  const stored = await authRepository.findPasswordResetToken(hashToken(token));

  if (!stored || stored.used_at || stored.expires_at.getTime() < Date.now()) {
    throw AppError.badRequest('This reset link is invalid or has expired', 'INVALID_RESET_TOKEN');
  }

  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await userRepository.updatePasswordHash(stored.user_id, passwordHash, client);
    await authRepository.markPasswordResetTokenUsed(stored.id, client);
    await authRepository.revokeAllRefreshTokensForUser(stored.user_id, client);
    await auditService.record(
      {
        userId: stored.user_id,
        action: 'PASSWORD_RESET',
        entityType: 'user',
        entityId: stored.user_id,
        description: 'Password reset using a reset link',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
      client,
    );
  });
};

export const changePassword = async (
  userId: number,
  currentPassword: string,
  newPassword: string,
  metadata: RequestMetadata,
): Promise<void> => {
  const user = await userRepository.findUserById(userId);

  if (!user) {
    throw AppError.notFound('Account not found', 'USER_NOT_FOUND');
  }

  const matches = await verifyPassword(currentPassword, user.password_hash);

  if (!matches) {
    throw AppError.badRequest('The current password is incorrect', 'INVALID_CURRENT_PASSWORD');
  }

  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await userRepository.updatePasswordHash(userId, passwordHash, client);
    await authRepository.revokeAllRefreshTokensForUser(userId, client);
    await auditService.record(
      {
        userId,
        action: 'PASSWORD_RESET',
        entityType: 'user',
        entityId: userId,
        description: 'Password changed by the account owner',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
      client,
    );
  });
};

export const issueVerificationToken = async (userId: number): Promise<string> => {
  const token = generateOpaqueToken(32);

  await authRepository.insertVerificationToken({
    userId,
    tokenHash: hashToken(token),
    expiresAt: durationToDate(`${env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS}h`),
  });

  return token;
};

export const verifyEmail = async (token: string): Promise<void> => {
  const stored = await authRepository.findVerificationToken(hashToken(token));

  if (!stored || stored.used_at || stored.expires_at.getTime() < Date.now()) {
    throw AppError.badRequest(
      'This verification link is invalid or has expired',
      'INVALID_VERIFICATION_TOKEN',
    );
  }

  await withTransaction(async (client) => {
    await userRepository.markEmailVerified(stored.user_id, client);
    await authRepository.markVerificationTokenUsed(stored.id, client);
  });
};

export const resendVerification = async (email: string): Promise<{ token?: string }> => {
  const user = await userRepository.findUserByEmail(email);

  if (!user || user.status !== 'PENDING_VERIFICATION') {
    return {};
  }

  const token = await issueVerificationToken(user.id);

  return env.isProduction ? {} : { token };
};
