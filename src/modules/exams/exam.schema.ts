import { z } from 'zod';
import {
  booleanQuerySchema,
  dateSchema,
  nullableString,
  optionalDateSchema,
  paginationQuerySchema,
  requiredString,
  timeSchema,
} from '../../schemas/common.schema';
import { EXAM_TYPES } from '../../types/enums';

export const createExamSchema = z.object({
  classId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
  termId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  roomId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  title: requiredString(200, 'Title'),
  type: z.enum(EXAM_TYPES),
  examDate: dateSchema,
  startTime: z.union([timeSchema, z.null()]).optional(),
  durationMinutes: z.union([z.coerce.number().int().positive().max(600), z.null()]).optional(),
  maxScore: z.coerce.number().positive().max(1000),
  instructions: nullableString(2000),
});

export const updateExamSchema = createExamSchema
  .omit({ classId: true, subjectId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listExamsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  termId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  type: z.enum(EXAM_TYPES).optional(),
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,
  upcomingOnly: booleanQuerySchema,
});

export const saveExamResultsSchema = z.object({
  results: z
    .array(
      z.object({
        studentId: z.coerce.number().int().positive(),
        score: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
        isAbsent: z.boolean().optional(),
        remark: nullableString(1000),
      }),
    )
    .min(1)
    .max(200),
});

export const upcomingExamsQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export type CreateExamBody = z.infer<typeof createExamSchema>;
export type UpdateExamBody = z.infer<typeof updateExamSchema>;
export type ListExamsQuery = z.infer<typeof listExamsQuerySchema>;
export type SaveExamResultsBody = z.infer<typeof saveExamResultsSchema>;
export type UpcomingExamsQuery = z.infer<typeof upcomingExamsQuerySchema>;
