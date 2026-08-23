import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config';
import { sendError } from '../utils/api-response';

const handler = (_req: Request, res: Response): void => {
  sendError(
    res,
    'Too many requests. Please wait before trying again.',
    429,
    'TOO_MANY_REQUESTS',
  );
};

/** Applied to the whole API surface. */
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip: () => !env.RATE_LIMIT_ENABLED || env.isTest,
});

/** Applied to credential endpoints so brute forcing a password is impractical. */
export const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler,
  skip: () => !env.RATE_LIMIT_ENABLED || env.isTest,
});
