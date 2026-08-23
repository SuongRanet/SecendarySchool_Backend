import { z } from 'zod';
import {
  dateSchema,
  nullableString,
  optionalDateSchema,
  paginationQuerySchema,
} from '../../schemas/common.schema';
import { ATTENDANCE_STATUSES } from '../../types/enums';

const entrySchema = z.object({
  studentId: z.coerce.number().int().positive(),
  status: z.enum(ATTENDANCE_STATUSES),
  reasonId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  note: nullableString(500),
  minutesLate: z.union([z.coerce.number().int().min(0).max(600), z.null()]).optional(),
});

export const recordAttendanceSchema = z.object({
  classId: z.coerce.number().int().positive(),
  attendanceDate: dateSchema,
  periodNumber: z.union([z.coerce.number().int().positive().max(20), z.null()]).optional(),
  subjectId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  scheduleId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  entries: z.array(entrySchema).min(1, 'At least one student must be marked').max(200),
});

export const updateAttendanceSchema = z
  .object({
    status: z.enum(ATTENDANCE_STATUSES).optional(),
    reasonId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
    note: nullableString(500),
    minutesLate: z.union([z.coerce.number().int().min(0).max(600), z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const attendanceSheetQuerySchema = z.object({
  classId: z.coerce.number().int().positive(),
  date: dateSchema,
  periodNumber: z.coerce.number().int().positive().max(20).optional(),
});

export const listAttendanceQuerySchema = paginationQuerySchema.extend({
  classId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,
  periodNumber: z.coerce.number().int().positive().max(20).optional(),
});

export const summaryQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,
});

export const trendQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive(),
  classId: z.coerce.number().int().positive().optional(),
  dateFrom: dateSchema,
  dateTo: dateSchema,
});

export const missingAttendanceQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  date: optionalDateSchema,
  teacherId: z.coerce.number().int().positive().optional(),
});

export type RecordAttendanceBody = z.infer<typeof recordAttendanceSchema>;
export type UpdateAttendanceBody = z.infer<typeof updateAttendanceSchema>;
export type AttendanceSheetQuery = z.infer<typeof attendanceSheetQuerySchema>;
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type TrendQuery = z.infer<typeof trendQuerySchema>;
export type MissingAttendanceQuery = z.infer<typeof missingAttendanceQuerySchema>;
