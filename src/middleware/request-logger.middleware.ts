import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

/** Logs the method, path, status and duration of every request once it finishes. */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`;

    if (res.statusCode >= 500) {
      logger.error(message, { requestId: req.requestId });
    } else if (res.statusCode >= 400) {
      logger.warn(message, { requestId: req.requestId });
    } else {
      logger.info(message, { requestId: req.requestId, userId: req.user?.id ?? null });
    }
  });

  next();
};
