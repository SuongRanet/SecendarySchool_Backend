import type { NextFunction, Request, Response } from 'express';
import { findPrincipalById } from '../modules/auth/auth.repository';
import { AppError } from '../utils/app-error';
import { verifyAccessToken } from '../utils/jwt';

const extractBearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;

  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
};

/**
 * Verifies the access token and loads the principal from the database on every
 * request. Roles and permissions are never trusted from the token body alone, so
 * a disabled account or a revoked role takes effect immediately.
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      throw AppError.unauthorized('Authentication token is missing', 'TOKEN_MISSING');
    }

    const payload = verifyAccessToken(token);
    const principal = await findPrincipalById(payload.sub);

    if (!principal) {
      throw AppError.unauthorized('Account no longer exists', 'ACCOUNT_NOT_FOUND');
    }

    if (principal.status !== 'ACTIVE') {
      throw AppError.forbidden(
        `Account is ${principal.status.toLowerCase().replace('_', ' ')}`,
        'ACCOUNT_NOT_ACTIVE',
      );
    }

    req.user = principal;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Attaches the principal when a valid token is present but never rejects the
 * request. Used by endpoints whose response varies for signed-in users.
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractBearerToken(req);

  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const principal = await findPrincipalById(payload.sub);

    if (principal && principal.status === 'ACTIVE') {
      req.user = principal;
    }
  } catch {
    // An invalid token is simply treated as an anonymous request here.
  }

  next();
};
