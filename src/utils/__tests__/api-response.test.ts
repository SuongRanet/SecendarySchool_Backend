import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import {
  buildPagination,
  sendCreated,
  sendError,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../api-response';

/**
 * The response helpers only touch `status()` and `json()`, so a two-method stub
 * is enough to assert on the envelope without booting Express.
 */
const createResponse = () => {
  const recorded: { statusCode: number | null; body: unknown } = { statusCode: null, body: null };

  const res = {
    status(code: number) {
      recorded.statusCode = code;
      return this;
    },
    json(body: unknown) {
      recorded.body = body;
      return this;
    },
  };

  return { res: res as unknown as Response, recorded };
};

describe('buildPagination', () => {
  it('rounds the page count up so a partial last page is still counted', () => {
    expect(buildPagination(1, 20, 121)).toEqual({
      page: 1,
      limit: 20,
      total: 121,
      totalPages: 7,
    });
  });

  it('reports a single page when the total fits exactly', () => {
    expect(buildPagination(1, 20, 20).totalPages).toBe(1);
  });

  it('reports no pages for an empty result', () => {
    expect(buildPagination(1, 20, 0).totalPages).toBe(0);
  });

  it('does not divide by zero when the limit is zero', () => {
    expect(buildPagination(1, 0, 50).totalPages).toBe(0);
  });
});

describe('success envelopes', () => {
  it('sendSuccess returns { success, message, data } with 200', () => {
    const { res, recorded } = createResponse();
    sendSuccess(res, { id: 1 }, 'Student loaded successfully');

    expect(recorded.statusCode).toBe(200);
    expect(recorded.body).toEqual({
      success: true,
      message: 'Student loaded successfully',
      data: { id: 1 },
    });
  });

  it('sendCreated uses 201', () => {
    const { res, recorded } = createResponse();
    sendCreated(res, { id: 1 }, 'Student created successfully');

    expect(recorded.statusCode).toBe(201);
    expect(recorded.body).toMatchObject({ success: true, data: { id: 1 } });
  });

  it('sendNoContent still answers 200 with a null payload', () => {
    const { res, recorded } = createResponse();
    sendNoContent(res, 'Student deleted successfully');

    expect(recorded.statusCode).toBe(200);
    expect(recorded.body).toEqual({
      success: true,
      message: 'Student deleted successfully',
      data: null,
    });
  });

  it('sendPaginated attaches the pagination meta beside the data', () => {
    const { res, recorded } = createResponse();
    sendPaginated(res, [{ id: 1 }], buildPagination(2, 20, 45));

    expect(recorded.body).toMatchObject({
      success: true,
      data: [{ id: 1 }],
      pagination: { page: 2, limit: 20, total: 45, totalPages: 3 },
    });
  });
});

describe('sendError', () => {
  it('returns { success: false, message, error: { code } }', () => {
    const { res, recorded } = createResponse();
    sendError(res, 'Student not found', 404, 'STUDENT_NOT_FOUND');

    expect(recorded.statusCode).toBe(404);
    expect(recorded.body).toEqual({
      success: false,
      message: 'Student not found',
      error: { code: 'STUDENT_NOT_FOUND' },
    });
  });

  it('adds field errors when validation failed', () => {
    const { res, recorded } = createResponse();
    sendError(res, 'Validation failed', 422, 'VALIDATION_ERROR', {
      errors: [{ field: 'email', message: 'Invalid email' }],
    });

    expect(recorded.body).toMatchObject({
      errors: [{ field: 'email', message: 'Invalid email' }],
    });
  });

  it('omits the errors array when there is nothing to report', () => {
    const { res, recorded } = createResponse();
    sendError(res, 'Boom', 500, 'INTERNAL_SERVER_ERROR', { errors: [] });

    expect(recorded.body).not.toHaveProperty('errors');
  });

  it('passes details through for a conflict', () => {
    const { res, recorded } = createResponse();
    sendError(res, 'Clash', 409, 'SCHEDULE_ROOM_CONFLICT', { details: { warning: true } });

    expect(recorded.body).toMatchObject({
      error: { code: 'SCHEDULE_ROOM_CONFLICT', details: { warning: true } },
    });
  });
});
