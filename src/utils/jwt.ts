import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config';
import { AppError } from './app-error';

export interface AccessTokenPayload {
  sub: number;
  username: string;
  roles: string[];
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: number;
  jti: string;
  type: 'refresh';
}

export const signAccessToken = (payload: Omit<AccessTokenPayload, 'type'>): string =>
  jwt.sign({ ...payload, type: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);

export const signRefreshToken = (payload: Omit<RefreshTokenPayload, 'type'>): string =>
  jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);

const verify = <T>(token: string, secret: string, expectedType: string): T => {
  try {
    const decoded = jwt.verify(token, secret) as T & { type?: string };

    if (decoded.type !== expectedType) {
      throw AppError.unauthorized('Invalid token type', 'INVALID_TOKEN');
    }

    return decoded;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Token has expired', 'TOKEN_EXPIRED');
    }

    throw AppError.unauthorized('Invalid authentication token', 'INVALID_TOKEN');
  }
};

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  verify<AccessTokenPayload>(token, env.JWT_SECRET, 'access');

export const verifyRefreshToken = (token: string): RefreshTokenPayload =>
  verify<RefreshTokenPayload>(token, env.JWT_REFRESH_SECRET, 'refresh');

/** Generates a cryptographically random opaque token (reset / verification links). */
export const generateOpaqueToken = (bytes = 48): string => randomBytes(bytes).toString('hex');

/** Only the hash of a token is ever persisted. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Converts a duration string such as `15m`, `7d`, `24h` or `3600` into a future
 * `Date`. Used to store the expiry of refresh and reset tokens.
 */
export const durationToDate = (duration: string, from: Date = new Date()): Date => {
  const match = /^(\d+)\s*([smhdw]?)$/i.exec(duration.trim());

  if (!match) {
    throw new Error(`Unsupported duration format: "${duration}"`);
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };

  return new Date(from.getTime() + amount * multipliers[unit]);
};
