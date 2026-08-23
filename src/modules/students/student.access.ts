import type { Request } from 'express';
import { isElevated } from '../../middleware/role.middleware';
import { AppError } from '../../utils/app-error';
import { requireUser } from '../../utils/request-context';
import type { StudentFilters } from './student.types';
import * as repository from './student.repository';

/**
 * Enforces who may read a specific student.
 *
 * - Super administrators, administrators and principals: any student.
 * - Parents: only the children linked to them.
 * - Students: only themselves.
 * - Teachers: only students currently in a class they teach or lead.
 *
 * This runs on the server for every student-scoped request; the frontend never
 * decides this.
 */
export const assertStudentReadAccess = async (
  req: Request,
  studentId: number,
): Promise<void> => {
  const user = requireUser(req);

  if (isElevated(user)) {
    return;
  }

  if (user.studentId && user.studentId === studentId) {
    return;
  }

  if (user.parentId) {
    const linked = await repository.parentHasStudent(user.parentId, studentId);

    if (linked) {
      return;
    }
  }

  if (user.teacherId) {
    const teaches = await repository.teacherHasStudent(user.teacherId, studentId);

    if (teaches) {
      return;
    }
  }

  throw AppError.forbidden(
    'You do not have access to this student record',
    'STUDENT_ACCESS_DENIED',
  );
};

/**
 * Narrows a student list query to the records the requester may see. A parent
 * always gets their own children, a student only themselves.
 */
export const applyStudentScope = (req: Request, filters: StudentFilters): StudentFilters => {
  const user = requireUser(req);

  if (isElevated(user)) {
    return filters;
  }

  if (user.parentId) {
    return { ...filters, parentId: user.parentId };
  }

  return filters;
};
