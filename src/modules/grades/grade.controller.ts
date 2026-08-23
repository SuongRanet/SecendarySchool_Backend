import type { Request, Response } from 'express';
import { buildPagination, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { resolvePagination } from '../../utils/pagination';
import { getAuditContext, requireUser } from '../../utils/request-context';
import { assertStudentReadAccess } from '../students/student.access';
import type {
  CalculateGradesBody,
  ClassAveragesQuery,
  GenerateGradesBody,
  ListGradesQuery,
  SaveGradeBody,
  SaveManyGradesBody,
  StudentGradesQuery,
  UpdateGradingSchemeBody,
} from './grade.schema';
import * as service from './grade.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListGradesQuery;
  const pagination = resolvePagination(query.page, query.limit);

  if (query.studentId) {
    await assertStudentReadAccess(req, query.studentId);
  }

  const result = await service.list(
    {
      academicYearId: query.academicYearId,
      termId: query.termId,
      classId: query.classId,
      subjectId: query.subjectId,
      studentId: query.studentId,
      isFinal: query.isFinal,
    },
    pagination,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Grades loaded successfully',
  );
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const grade = await service.getById(Number(req.params.id));

  return sendSuccess(res, grade, 'Grade loaded successfully');
});

export const listForStudent = asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.studentId);
  await assertStudentReadAccess(req, studentId);

  const query = req.query as unknown as StudentGradesQuery;
  const grades = await service.listForStudent(studentId, query);

  return sendSuccess(res, grades, 'Student grades loaded successfully');
});

/** Preview: computes the weighted grades without saving them. */
export const calculate = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CalculateGradesBody;
  const calculated = await service.calculateForClass(
    body.classId,
    body.subjectId,
    body.termId ?? null,
  );

  return sendSuccess(res, calculated, 'Grades calculated successfully');
});

export const generate = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as GenerateGradesBody;
  const grades = await service.generateForClass(
    body.classId,
    body.subjectId,
    body.termId ?? null,
    body.isFinal ?? false,
    requireUser(req),
    getAuditContext(req),
  );

  return sendSuccess(res, grades, 'Grades generated successfully');
});

export const save = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SaveGradeBody;
  const grade = await service.saveGrade(body, requireUser(req), getAuditContext(req));

  return sendSuccess(res, grade, 'Grade saved successfully');
});

export const saveMany = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SaveManyGradesBody;
  const grades = await service.saveManyGrades(body.grades, requireUser(req), getAuditContext(req));

  return sendSuccess(res, grades, 'Grades saved successfully');
});

export const history = asyncHandler(async (req: Request, res: Response) => {
  const entries = await service.history(Number(req.params.id));

  return sendSuccess(res, entries, 'Grade history loaded successfully');
});

export const listSchemes = asyncHandler(async (_req: Request, res: Response) => {
  const schemes = await service.listSchemes();

  return sendSuccess(res, schemes, 'Grading schemes loaded successfully');
});

export const updateScheme = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateGradingSchemeBody;
  const scheme = await service.updateScheme(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, scheme, 'Grading scheme updated successfully');
});

export const classAverages = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ClassAveragesQuery;

  const data = query.classId
    ? await service.classSubjectAverages(query.classId, query.academicYearId, query.termId ?? null)
    : await service.classAverages(query.academicYearId, query.termId ?? null);

  return sendSuccess(res, data, 'Academic performance loaded successfully');
});
