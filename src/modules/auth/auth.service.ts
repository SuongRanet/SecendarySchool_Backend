import { randomUUID } from 'node:crypto';
import { env } from '../../config';
import { withTransaction } from '../../database/connection';
import { AppError } from '../../utils/app-error';
import {
  durationToDate,
  generateNumericCode,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt';
import { logger } from '../../utils/logger';
import { maskEmail, passwordResetCodeMail, sendMail } from '../../utils/mailer';
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
    profileCode: withProfile?.profile_code ?? null,
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
 * Starts a password reset.
 *
 * An address with no account is refused with `EMAIL_NOT_REGISTERED` so the
 * person learns at once that they typed the wrong address, instead of waiting
 * for a code that will never arrive. The trade-off is that the endpoint now
 * confirms which addresses are registered; `authRateLimiter` on the route is
 * what keeps that from being walked through at speed.
 */
export const forgotPassword = async (
  email: string,
): Promise<{ sentTo: string; code?: string }> => {
  const sentTo = maskEmail(email);
  const user = await userRepository.findUserByEmail(email);

  if (!user) {
    throw AppError.notFound("This email isn't registered", 'EMAIL_NOT_REGISTERED');
  }

  if (user.status === 'SUSPENDED') {
    throw AppError.forbidden('This account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  const code = generateNumericCode(env.PASSWORD_RESET_CODE_LENGTH);
  const expiresAt = durationToDate(`${env.PASSWORD_RESET_TOKEN_TTL_MINUTES}m`);

  // Only one code is live at a time: requesting a new one retires the old.
  await authRepository.invalidatePasswordResetTokens(user.id);
  await authRepository.insertPasswordResetToken({
    userId: user.id,
    tokenHash: hashToken(`${user.id}:${code}`),
    expiresAt,
  });

  const delivered = await sendMail({
    to: user.email,
    ...passwordResetCodeMail(code, env.PASSWORD_RESET_TOKEN_TTL_MINUTES),
  });

  logger.info('Password reset code issued', { userId: user.id, expiresAt, delivered });

  // The code travels back to the caller only when the email could not be sent
  // and this is not production — that is, when there is no mail server to read
  // it from. As soon as SMTP is configured and working, the code lives in the
  // inbox alone and never appears in the response or on screen.
  if (delivered || env.isProduction) {
    return { sentTo };
  }

  return { sentTo, code };
};

/**
 * Finds the live reset request for an address and checks the code against it.
 *
 * A wrong code is counted. Once the attempt limit is reached the request is
 * burned rather than merely rejected, so a six digit code cannot be walked
 * through by repetition.
 */
const consumeResetCode = async (
  email: string,
  code: string,
): Promise<{ id: number; userId: number }> => {
  const invalid = () =>
    AppError.badRequest('This code is invalid or has expired', 'INVALID_RESET_CODE');

  const user = await userRepository.findUserByEmail(email);

  if (!user) {
    throw invalid();
  }

  const stored = await authRepository.findLivePasswordResetToken(user.id);

  if (!stored || stored.used_at || stored.expires_at.getTime() < Date.now()) {
    throw invalid();
  }

  if ((stored.attempts ?? 0) >= env.PASSWORD_RESET_MAX_ATTEMPTS) {
    await authRepository.markPasswordResetTokenUsed(stored.id);
    throw AppError.badRequest(
      'Too many incorrect codes were entered. Request a new code.',
      'RESET_CODE_ATTEMPTS_EXCEEDED',
    );
  }

  if (stored.token_hash !== hashToken(`${user.id}:${code}`)) {
    const attempts = await authRepository.recordPasswordResetAttempt(stored.id);

    if (attempts >= env.PASSWORD_RESET_MAX_ATTEMPTS) {
      await authRepository.markPasswordResetTokenUsed(stored.id);
    }

    throw invalid();
  }

  return { id: stored.id, userId: user.id };
};

/** Step two: confirm the code, before the person is asked for a new password. */
export const verifyResetCode = async (
  email: string,
  code: string,
): Promise<{ verified: true }> => {
  const stored = await consumeResetCode(email, code);

  await authRepository.markPasswordResetTokenVerified(stored.id);

  return { verified: true };
};

/**
 * Step three: set the new password.
 *
 * The code is checked again rather than trusting the verification step, so a
 * caller cannot skip straight here. Every existing session is revoked: if the
 * reset was prompted by someone else having the password, their session must
 * not survive it.
 */
export const resetPassword = async (
  email: string,
  code: string,
  newPassword: string,
  metadata: RequestMetadata,
): Promise<void> => {
  const stored = await consumeResetCode(email, code);

  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await userRepository.updatePasswordHash(stored.userId, passwordHash, client);
    await authRepository.markPasswordResetTokenUsed(stored.id, client);
    await authRepository.revokeAllRefreshTokensForUser(stored.userId, client);
    await auditService.record(
      {
        userId: stored.userId,
        action: 'PASSWORD_RESET',
        entityType: 'user',
        entityId: stored.userId,
        description: 'Password reset using an emailed code',
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
