import type { Request, Response } from 'express';
import {
  buildPagination,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { isElevated } from '../../middleware/role.middleware';
import { resolvePagination } from '../../utils/pagination';
import { getAuditContext, requireUser } from '../../utils/request-context';
import * as academicYearService from '../academic-years/academic-year.service';
import { assertStudentReadAccess } from '../students/student.access';
import type {
  AttendanceSheetQuery,
  ListAttendanceQuery,
  MissingAttendanceQuery,
  RecordAttendanceBody,
  SummaryQuery,
  TrendQuery,
  UpdateAttendanceBody,
} from './attendance.schema';
import * as service from './attendance.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAttendanceQuery;
  const pagination = resolvePagination(query.page, query.limit);

  if (query.studentId) {
    await assertStudentReadAccess(req, query.studentId);
  }

  const result = await service.list(
    {
      classId: query.classId,
      studentId: query.studentId,
      academicYearId: query.academicYearId,
      subjectId: query.subjectId,
      status: query.status,
      dateFrom: query.dateFrom ?? undefined,
      dateTo: query.dateTo ?? undefined,
      periodNumber: query.periodNumber,
    },
    pagination,
  );

  return sendPaginated(
    res,
    result.rows,
    buildPagination(pagination.page, pagination.limit, result.total),
    'Attendance loaded successfully',
  );
});

export const getSheet = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as AttendanceSheetQuery;
  const sheet = await service.getSheet(query.classId, query.date, query.periodNumber ?? null);

  return sendSuccess(res, sheet, 'Attendance sheet loaded successfully');
});

export const record = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RecordAttendanceBody;
  const user = requireUser(req);
  const saved = await service.record(body, user, getAuditContext(req));

  return sendCreated(res, saved, 'Attendance recorded successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const attendance = await service.getById(Number(req.params.id));

  return sendSuccess(res, attendance, 'Attendance record loaded successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateAttendanceBody;
  const user = requireUser(req);
  const updated = await service.updateRecord(
    Number(req.params.id),
    body,
    user,
    getAuditContext(req),
  );

  return sendSuccess(res, updated, 'Attendance updated successfully');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await service.removeRecord(Number(req.params.id), user, getAuditContext(req));

  return sendNoContent(res, 'Attendance record deleted successfully');
});

export const studentSummary = asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.studentId);
  await assertStudentReadAccess(req, studentId);

  const query = req.query as unknown as SummaryQuery;
  const summary = await service.summarizeStudent(studentId, {
    academicYearId: query.academicYearId,
    dateFrom: query.dateFrom ?? undefined,
    dateTo: query.dateTo ?? undefined,
  });

  return sendSuccess(res, summary, 'Attendance summary loaded successfully');
});

export const classSummary = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as SummaryQuery;
  const classId = Number(req.params.classId);

  const [summary, students] = await Promise.all([
    service.summarizeClass(classId, {
      dateFrom: query.dateFrom ?? undefined,
      dateTo: query.dateTo ?? undefined,
    }),
    service.summarizeClassStudents(classId, {
      dateFrom: query.dateFrom ?? undefined,
      dateTo: query.dateTo ?? undefined,
    }),
  ]);

  return sendSuccess(res, { summary, students }, 'Class attendance summary loaded successfully');
});

export const trend = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as TrendQuery;
  const points = await service.dailyTrend(query);

  return sendSuccess(res, points, 'Attendance trend loaded successfully');
});

export const todayOverview = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as SummaryQuery;
  const academicYearId =
    query.academicYearId ?? (await academicYearService.requireActiveYear()).id;

  const overview = await service.todayOverview(academicYearId);

  return sendSuccess(res, overview, "Today's attendance loaded successfully");
});

export const missing = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as MissingAttendanceQuery;
  const user = requireUser(req);
  const academicYearId =
    query.academicYearId ?? (await academicYearService.requireActiveYear()).id;

  const teacherId = !isElevated(user) && user.teacherId ? user.teacherId : query.teacherId;
  const date = query.date ?? new Date().toISOString().slice(0, 10);

  const classes = await service.listClassesMissingAttendance(academicYearId, date, teacherId);

  return sendSuccess(res, classes, 'Pending attendance loaded successfully');
});

export const listReasons = asyncHandler(async (_req: Request, res: Response) => {
  const reasons = await service.listReasons();

  return sendSuccess(res, reasons, 'Attendance reasons loaded successfully');
});
