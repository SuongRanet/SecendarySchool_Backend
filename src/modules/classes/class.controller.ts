import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { resolvePagination, resolveSort } from '../../utils/pagination';
import { getAuditContext, requireUser } from '../../utils/request-context';
import { isElevated } from '../../middleware/role.middleware';
import { AppError } from '../../utils/app-error';
import * as teacherRepository from '../teachers/teacher.repository';
import { CLASS_SORT_COLUMNS } from './class.repository';
import type {
  AssignClassSubjectBody,
  ClassStudentsQuery,
  CreateClassBody,
  ListClassesQuery,
  ReplaceClassSubjectsBody,
  UpdateClassBody,
} from './class.schema';
import * as service from './class.service';

/**
 * A teacher may only read a class they teach or are homeroom teacher of.
 * Administrators, principals and super administrators are exempt.
 */
const assertClassReadAccess = async (req: Request, classId: number): Promise<void> => {
  const user = requireUser(req);

  if (isElevated(user) || !user.teacherId) {
    return;
  }

  const hasAccess = await teacherRepository.teacherHasClassAccess(user.teacherId, classId);

  if (!hasAccess) {
    throw AppError.forbidden('You are not assigned to this class', 'CLASS_ACCESS_DENIED');
  }
};

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListClassesQuery;
  const user = requireUser(req);
  const pagination = resolvePagination(query.page, query.limit);
  const sort = resolveSort(query.sortBy, query.sortOrder, CLASS_SORT_COLUMNS, 'grade_level');

  // A teacher without school-wide access only ever sees their own classes.
  const teacherScope = !isElevated(user) && user.teacherId ? user.teacherId : query.teacherId;

  const result = await service.list(
    {
      search: query.search,
      academicYearId: query.academicYearId,
      gradeLevelId: query.gradeLevelId,
      homeroomTeacherId: query.homeroomTeacherId,
      teacherId: teacherScope,
      isActive: query.isActive,
    },
    pagination,
    { sortBy: sort.sortBy, sortOrder: query.sortOrder ? sort.sortOrder : 'ASC' },
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Classes loaded successfully',
  );
});

export const listOptions = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListClassesQuery;
  const user = requireUser(req);

  const classes = await service.listAll({
    academicYearId: query.academicYearId,
    gradeLevelId: query.gradeLevelId,
    teacherId: !isElevated(user) && user.teacherId ? user.teacherId : query.teacherId,
    isActive: true,
  });

  return sendSuccess(res, classes, 'Classes loaded successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const classId = Number(req.params.id);
  await assertClassReadAccess(req, classId);

  const classRecord = await service.getById(classId);

  return sendSuccess(res, classRecord, 'Class loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateClassBody;
  const classRecord = await service.create(body, getAuditContext(req));

  return sendCreated(res, classRecord, 'Class created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateClassBody;
  const classRecord = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, classRecord, 'Class updated successfully');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archive(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Class archived successfully');
});

export const listSubjects = asyncHandler(async (req: Request, res: Response) => {
  const classId = Number(req.params.id);
  const query = req.query as unknown as { mine?: boolean };
  const user = requireUser(req);

  await assertClassReadAccess(req, classId);

  /**
   * `mine=true` asks for the subjects this teacher may write to, rather than
   * everything the class is taught.
   *
   * It is opt-in because the same endpoint answers both questions: the class
   * page prints the full curriculum, while a mark sheet must offer only what
   * the teacher can save. An elevated user asking for "mine" still gets all of
   * them, because they may grade any subject.
   */
  const scopeToTeacher = query.mine === true && !isElevated(user) && user.teacherId
    ? user.teacherId
    : undefined;

  const subjects = await service.listSubjects(classId, scopeToTeacher);

  return sendSuccess(res, subjects, 'Class subjects loaded successfully');
});

export const assignSubject = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as AssignClassSubjectBody;
  const classSubject = await service.assignSubject(
    Number(req.params.id),
    body,
    getAuditContext(req),
  );

  return sendCreated(res, classSubject, 'Subject assigned successfully');
});

export const replaceSubjects = asyncHandler(async (req: Request, res: Response) => {
  const { subjects } = req.body as ReplaceClassSubjectsBody;
  const result = await service.replaceSubjects(
    Number(req.params.id),
    subjects,
    getAuditContext(req),
  );

  return sendSuccess(res, result, 'Class subjects updated successfully');
});

export const removeSubject = asyncHandler(async (req: Request, res: Response) => {
  await service.removeSubject(
    Number(req.params.id),
    Number(req.params.classSubjectId),
    getAuditContext(req),
  );

  return sendNoContent(res, 'Subject removed from the class successfully');
});

export const listStudents = asyncHandler(async (req: Request, res: Response) => {
  const classId = Number(req.params.id);
  await assertClassReadAccess(req, classId);

  const query = req.query as unknown as ClassStudentsQuery;
  const students = await service.listStudents(classId, query.includeInactive ?? false);

  return sendSuccess(res, students, 'Class students loaded successfully');
});
