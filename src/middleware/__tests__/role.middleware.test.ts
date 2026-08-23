import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../config/permissions';
import type { AuthenticatedUser } from '../../types';
import { AppError } from '../../utils/app-error';
import {
  hasPermission,
  hasRole,
  isElevated,
  requireAllPermissions,
  requirePermissions,
  requireRoles,
} from '../role.middleware';

const buildUser = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 1,
  username: 'sokha',
  email: 'sokha@example.com',
  status: 'ACTIVE',
  roles: ['TEACHER'],
  permissions: [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.ATTENDANCE_RECORD],
  teacherId: 5,
  studentId: null,
  parentId: null,
  ...overrides,
});

/** Runs a middleware and reports whatever it handed to `next`. */
const run = (middleware: ReturnType<typeof requireRoles>, user?: AuthenticatedUser) => {
  let passed: unknown = 'not-called';
  const req = { user } as unknown as Request;
  const next: NextFunction = (error?: unknown) => {
    passed = error;
  };

  middleware(req, {} as Response, next);

  return passed;
};

describe('hasRole', () => {
  it('is true when the user holds one of the listed roles', () => {
    expect(hasRole(buildUser(), 'TEACHER', 'PRINCIPAL')).toBe(true);
  });

  it('is false when the user holds none of them', () => {
    expect(hasRole(buildUser(), 'ACCOUNTANT')).toBe(false);
  });

  it('is false when no role is listed at all', () => {
    expect(hasRole(buildUser())).toBe(false);
  });
});

describe('hasPermission', () => {
  it('is true when the user holds any one of the listed permissions', () => {
    expect(hasPermission(buildUser(), PERMISSIONS.STUDENTS_CREATE, PERMISSIONS.STUDENTS_VIEW)).toBe(
      true,
    );
  });

  it('is false when the user holds none of them', () => {
    expect(hasPermission(buildUser(), PERMISSIONS.STUDENTS_ARCHIVE)).toBe(false);
  });
});

describe('isElevated', () => {
  it.each(['SUPER_ADMIN', 'ADMIN', 'PRINCIPAL'] as const)('is true for %s', (role) => {
    expect(isElevated(buildUser({ roles: [role] }))).toBe(true);
  });

  it.each(['TEACHER', 'HOMEROOM_TEACHER', 'PARENT', 'STUDENT', 'ACCOUNTANT'] as const)(
    'is false for %s',
    (role) => {
      expect(isElevated(buildUser({ roles: [role] }))).toBe(false);
    },
  );

  it('is true when an elevated role sits beside an ordinary one', () => {
    expect(isElevated(buildUser({ roles: ['TEACHER', 'PRINCIPAL'] }))).toBe(true);
  });
});

describe('requireRoles', () => {
  it('calls next with no error when the role matches', () => {
    expect(run(requireRoles('TEACHER'), buildUser())).toBeUndefined();
  });

  it('rejects a mismatched role with 403 INSUFFICIENT_ROLE', () => {
    const error = run(requireRoles('ADMIN'), buildUser());

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(403);
    expect((error as AppError).code).toBe('INSUFFICIENT_ROLE');
  });

  it('rejects an unauthenticated request with 401', () => {
    const error = run(requireRoles('TEACHER'));

    expect((error as AppError).statusCode).toBe(401);
  });
});

describe('requirePermissions', () => {
  it('passes when the user holds at least one listed permission', () => {
    expect(
      run(requirePermissions(PERMISSIONS.STUDENTS_ARCHIVE, PERMISSIONS.STUDENTS_VIEW), buildUser()),
    ).toBeUndefined();
  });

  it('rejects with 403 INSUFFICIENT_PERMISSION when the user holds none', () => {
    const error = run(requirePermissions(PERMISSIONS.STUDENTS_ARCHIVE), buildUser());

    expect((error as AppError).statusCode).toBe(403);
    expect((error as AppError).code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('rejects an unauthenticated request with 401', () => {
    const error = run(requirePermissions(PERMISSIONS.STUDENTS_VIEW));

    expect((error as AppError).statusCode).toBe(401);
  });
});

describe('requireAllPermissions', () => {
  it('passes only when every listed permission is held', () => {
    expect(
      run(
        requireAllPermissions(PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.ATTENDANCE_RECORD),
        buildUser(),
      ),
    ).toBeUndefined();
  });

  it('rejects when one of them is missing', () => {
    const error = run(
      requireAllPermissions(PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.STUDENTS_ARCHIVE),
      buildUser(),
    );

    expect((error as AppError).statusCode).toBe(403);
    expect((error as AppError).code).toBe('INSUFFICIENT_PERMISSION');
  });
});
