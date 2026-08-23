export interface FieldError {
  field: string;
  message: string;
}

/**
 * Application level error carrying an HTTP status and a stable machine readable
 * error code. Every expected failure in a service or repository should be raised
 * through one of these helpers so the error middleware can produce a consistent
 * response without leaking internal database details.
 */
export class AppError extends Error {
  public readonly statusCode: number;

  public readonly code: string;

  public readonly errors?: FieldError[];

  public readonly details?: Record<string, unknown>;

  public readonly isOperational = true;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_SERVER_ERROR',
    options: { errors?: FieldError[]; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = options.errors;
    this.details = options.details;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(
    message = 'Bad request',
    code = 'BAD_REQUEST',
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(message, 400, code, { details });
  }

  static validation(message = 'Validation failed', errors: FieldError[] = []): AppError {
    return new AppError(message, 422, 'VALIDATION_ERROR', { errors });
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED'): AppError {
    return new AppError(message, 401, code);
  }

  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN'): AppError {
    return new AppError(message, 403, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND'): AppError {
    return new AppError(message, 404, code);
  }

  static conflict(message = 'Resource conflict', code = 'CONFLICT', details?: Record<string, unknown>): AppError {
    return new AppError(message, 409, code, { details });
  }

  static unprocessable(
    message = 'Request could not be processed',
    code = 'UNPROCESSABLE_ENTITY',
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(message, 422, code, { details });
  }

  static tooManyRequests(message = 'Too many requests', code = 'TOO_MANY_REQUESTS'): AppError {
    return new AppError(message, 429, code);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_SERVER_ERROR'): AppError {
    return new AppError(message, 500, code);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
