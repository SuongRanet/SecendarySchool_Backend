import { describe, expect, it } from 'vitest';
import { AppError, isAppError } from '../app-error';

describe('AppError factories', () => {
  const cases: [string, AppError, number, string][] = [
    ['badRequest', AppError.badRequest(), 400, 'BAD_REQUEST'],
    ['validation', AppError.validation(), 422, 'VALIDATION_ERROR'],
    ['unauthorized', AppError.unauthorized(), 401, 'UNAUTHORIZED'],
    ['forbidden', AppError.forbidden(), 403, 'FORBIDDEN'],
    ['notFound', AppError.notFound(), 404, 'NOT_FOUND'],
    ['conflict', AppError.conflict(), 409, 'CONFLICT'],
    ['tooManyRequests', AppError.tooManyRequests(), 429, 'TOO_MANY_REQUESTS'],
    ['internal', AppError.internal(), 500, 'INTERNAL_SERVER_ERROR'],
  ];

  it.each(cases)('%s maps to the right status and code', (_name, error, statusCode, code) => {
    expect(error.statusCode).toBe(statusCode);
    expect(error.code).toBe(code);
  });

  it('keeps a caller supplied code', () => {
    expect(AppError.notFound('Student not found', 'STUDENT_NOT_FOUND').code).toBe(
      'STUDENT_NOT_FOUND',
    );
  });

  it('carries field errors on a validation failure', () => {
    const error = AppError.validation('Validation failed', [
      { field: 'email', message: 'Invalid email' },
    ]);

    expect(error.errors).toEqual([{ field: 'email', message: 'Invalid email' }]);
  });

  it('carries details on a conflict', () => {
    const error = AppError.conflict('Clash', 'SCHEDULE_CONFLICT', { warning: true });

    expect(error.details).toEqual({ warning: true });
  });

  it('is a real Error with a stack and an operational flag', () => {
    const error = AppError.internal();

    expect(error).toBeInstanceOf(Error);
    expect(error.isOperational).toBe(true);
    expect(error.stack).toBeTruthy();
  });
});

describe('isAppError', () => {
  it('recognises an AppError', () => {
    expect(isAppError(AppError.notFound())).toBe(true);
  });

  it('rejects a plain error and other values', () => {
    expect(isAppError(new Error('boom'))).toBe(false);
    expect(isAppError('boom')).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});
