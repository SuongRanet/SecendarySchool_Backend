import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/app-error';

/** Converts an unmatched route into the standard error response shape. */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`, 'ROUTE_NOT_FOUND'));
};
