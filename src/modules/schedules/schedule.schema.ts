import { z } from 'zod';
import {
  booleanQuerySchema,
  nullableString,
  optionalDateSchema,
  timeSchema,
} from '../../schemas/common.schema';
import { WEEKDAYS } from '../../types/enums';

export const createScheduleSchema = z.object({
  classId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
  teacherId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  roomId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  dayOfWeek: z.enum(WEEKDAYS),
  periodNumber: z.union([z.coerce.number().int().positive().max(20), z.null()]).optional(),
  startTime: timeSchema,
  endTime: timeSchema,
  effectiveFrom: optionalDateSchema,
  effectiveTo: optionalDateSchema,
  notes: nullableString(500),
  isActive: z.boolean().optional(),
  ignoreWarnings: z.boolean().optional(),
});

export const updateScheduleSchema = createScheduleSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listSchedulesQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  teacherId: z.coerce.number().int().positive().optional(),
  roomId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  dayOfWeek: z.enum(WEEKDAYS).optional(),
  isActive: booleanQuerySchema,
});

export const checkConflictsSchema = z.object({
  classId: z.coerce.number().int().positive(),
  dayOfWeek: z.enum(WEEKDAYS),
  startTime: timeSchema,
  endTime: timeSchema,
  teacherId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  roomId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  excludeScheduleId: z.coerce.number().int().positive().optional(),
});

export const todayScheduleQuerySchema = z.object({
  teacherId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
});

export type CreateScheduleBody = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleBody = z.infer<typeof updateScheduleSchema>;
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;
export type CheckConflictsBody = z.infer<typeof checkConflictsSchema>;
export type TodayScheduleQuery = z.infer<typeof todayScheduleQuerySchema>;
