import type { Response } from 'express';
import type { FieldError } from './app-error';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SuccessBody<T> {
  success: true;
  message: string;
  data: T;
  pagination?: PaginationMeta;
}

export interface ErrorBody {
  success: false;
  message: string;
  error?: { code: string; details?: Record<string, unknown> };
  errors?: FieldError[];
}

export const buildPagination = (page: number, limit: number, total: number): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});

/** `{ success: true, message, data }` */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  message = 'Request completed successfully',
  statusCode = 200,
): Response<SuccessBody<T>> => res.status(statusCode).json({ success: true, message, data });

/** `{ success: true, message, data }` with `201 Created`. */
export const sendCreated = <T>(
  res: Response,
  data: T,
  message = 'Resource created successfully',
): Response<SuccessBody<T>> => sendSuccess(res, data, message, 201);

/** `{ success: true, message, data, pagination }` */
export const sendPaginated = <T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  message = 'Request completed successfully',
  statusCode = 200,
): Response<SuccessBody<T[]>> =>
  res.status(statusCode).json({ success: true, message, data, pagination });

/** `{ success: true, message, data: null }` for successful writes with no body. */
export const sendNoContent = (
  res: Response,
  message = 'Request completed successfully',
): Response<SuccessBody<null>> => sendSuccess(res, null, message, 200);

/** `{ success: false, message, error }` */
export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
  code = 'INTERNAL_SERVER_ERROR',
  options: { errors?: FieldError[]; details?: Record<string, unknown> } = {},
): Response<ErrorBody> => {
  const body: ErrorBody = {
    success: false,
    message,
    error: { code, ...(options.details ? { details: options.details } : {}) },
  };

  if (options.errors && options.errors.length > 0) {
    body.errors = options.errors;
  }

  return res.status(statusCode).json(body);
};
