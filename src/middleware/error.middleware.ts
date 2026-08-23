import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config';
import { AppError, isAppError } from '../utils/app-error';
import type { FieldError } from '../utils/app-error';
import { sendError } from '../utils/api-response';
import { logger } from '../utils/logger';
import { toFieldErrors } from './validation.middleware';

interface PostgresError extends Error {
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

const isPostgresError = (error: unknown): error is PostgresError =>
  error instanceof Error && typeof (error as PostgresError).code === 'string';

/**
 * Translates a PostgreSQL error into a safe client facing error. The raw driver
 * message is never returned because it exposes table names, column names and
 * sometimes row values.
 */
const translatePostgresError = (error: PostgresError): AppError => {
  switch (error.code) {
    case '23505':
      return AppError.conflict(
        'A record with the same unique value already exists',
        'DUPLICATE_RECORD',
      );
    case '23503':
      return AppError.conflict(
        'This record is referenced by other records and cannot be changed',
        'FOREIGN_KEY_VIOLATION',
      );
    case '23502':
      return AppError.badRequest('A required field is missing', 'NOT_NULL_VIOLATION');
    case '23514':
      return AppError.badRequest('A value violates a data rule', 'CHECK_VIOLATION');
    case '22P02':
      return AppError.badRequest('A value has an invalid format', 'INVALID_INPUT_FORMAT');
    case '22003':
      return AppError.badRequest('A numeric value is out of range', 'NUMERIC_OUT_OF_RANGE');
    case '40P01':
      return AppError.conflict('The operation deadlocked; please retry', 'DEADLOCK_DETECTED');
    case '40001':
      return AppError.conflict('The operation conflicted; please retry', 'SERIALIZATION_FAILURE');
    case '57014':
      return new AppError('The operation timed out', 503, 'STATEMENT_TIMEOUT');
    case 'ECONNREFUSED':
    case '08006':
    case '08003':
      return new AppError('The database is unavailable', 503, 'DATABASE_UNAVAILABLE');
    default:
      return AppError.internal();
  }
};

/** Terminal error handler — every failure leaves the API in the documented shape. */
export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let appError: AppError;
  let fieldErrors: FieldError[] | undefined;

  if (isAppError(error)) {
    appError = error;
    fieldErrors = error.errors;
  } else if (error instanceof ZodError) {
    fieldErrors = toFieldErrors(error);
    appError = AppError.validation('Validation failed', fieldErrors);
  } else if (error instanceof SyntaxError && 'body' in error) {
    appError = AppError.badRequest('Request body is not valid JSON', 'INVALID_JSON');
  } else if (isPostgresError(error)) {
    appError = translatePostgresError(error);
    logger.error('Database error', {
      requestId: req.requestId,
      code: error.code,
      constraint: error.constraint,
      table: error.table,
      message: error.message,
    });
  } else {
    appError = AppError.internal();
  }

  const isServerError = appError.statusCode >= 500;

  if (isServerError) {
    logger.error(`${req.method} ${req.originalUrl} failed`, {
      requestId: req.requestId,
      userId: req.user?.id ?? null,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  } else {
    logger.warn(`${req.method} ${req.originalUrl} rejected`, {
      requestId: req.requestId,
      userId: req.user?.id ?? null,
      code: appError.code,
      message: appError.message,
    });
  }

  const details: Record<string, unknown> = {
    ...(appError.details ?? {}),
    ...(env.isProduction ? {} : { requestId: req.requestId }),
  };

  sendError(res, appError.message, appError.statusCode, appError.code, {
    errors: fieldErrors,
    details: Object.keys(details).length > 0 ? details : undefined,
  });
};
