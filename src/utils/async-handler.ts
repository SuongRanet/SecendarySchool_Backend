import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async controller so a rejected promise reaches the error middleware
 * instead of becoming an unhandled rejection.
 */
export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };
