import type { Request, Response } from 'express';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { isElevated } from '../../middleware/role.middleware';
import { getAuditContext, requireUser } from '../../utils/request-context';
import * as classRepository from '../classes/class.repository';
import type {
  CheckConflictsBody,
  CreateScheduleBody,
  ListSchedulesQuery,
  TodayScheduleQuery,
  UpdateScheduleBody,
} from './schedule.schema';
import * as service from './schedule.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListSchedulesQuery;
  const user = requireUser(req);

  // A parent or student without a filter sees their own (children's) timetable.
  let studentId = query.studentId;

  if (!isElevated(user) && !user.teacherId && user.studentId && !studentId) {
    studentId = user.studentId;
  }

  const schedules = await service.list({
    academicYearId: query.academicYearId,
    classId: query.classId,
    teacherId: query.teacherId,
    roomId: query.roomId,
    subjectId: query.subjectId,
    dayOfWeek: query.dayOfWeek,
    studentId,
    isActive: query.isActive,
  });

  return sendSuccess(res, schedules, 'Schedule loaded successfully');
});

export const listToday = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as TodayScheduleQuery;
  const user = requireUser(req);

  const teacherId = !isElevated(user) && user.teacherId ? user.teacherId : query.teacherId;
  const schedules = await service.listForToday({ teacherId, classId: query.classId });

  return sendSuccess(res, schedules, "Today's schedule loaded successfully");
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await service.getById(Number(req.params.id));

  return sendSuccess(res, schedule, 'Schedule entry loaded successfully');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateScheduleBody;
  const result = await service.create(body, getAuditContext(req));

  return sendCreated(res, result, 'Schedule entry created successfully');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateScheduleBody;
  const result = await service.update(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, result, 'Schedule entry updated successfully');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.remove(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Schedule entry deleted successfully');
});

/** Dry run used by the timetable editor before saving. */
export const checkConflicts = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CheckConflictsBody;
  const classRow = await classRepository.findClassById(body.classId);

  const conflicts = classRow
    ? await service.detectConflicts({
        academicYearId: classRow.academic_year_id,
        classId: body.classId,
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        teacherId: body.teacherId,
        roomId: body.roomId,
        excludeScheduleId: body.excludeScheduleId,
      })
    : [];

  return sendSuccess(
    res,
    { conflicts, hasBlockingConflict: conflicts.some((item) => item.kind !== 'ROOM') },
    conflicts.length === 0 ? 'No conflicts found' : 'Conflicts detected',
  );
});
