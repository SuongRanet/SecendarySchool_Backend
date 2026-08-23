import type { Request } from 'express';
import type { AuditContext, AuthenticatedUser } from '../types';
import { AppError } from './app-error';

/** Returns the authenticated principal, or throws when the route was not protected. */
export const requireUser = (req: Request): AuthenticatedUser => {
  if (!req.user) {
    throw AppError.unauthorized();
  }

  return req.user;
};

export const getClientIp = (req: Request): string | null => {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip ?? req.socket.remoteAddress ?? null;
};

export const getUserAgent = (req: Request): string | null => {
  const agent = req.headers['user-agent'];
  return typeof agent === 'string' ? agent.slice(0, 512) : null;
};

/** Collects the metadata every audit log entry records about a request. */
export const getAuditContext = (req: Request): AuditContext => ({
  userId: req.user?.id ?? null,
  ipAddress: getClientIp(req),
  userAgent: getUserAgent(req),
});
