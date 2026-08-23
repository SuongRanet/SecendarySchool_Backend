import { z } from 'zod';
import {
  booleanQuerySchema,
  dateSchema,
  nullableString,
  optionalDateSchema,
  paginationQuerySchema,
  requiredString,
} from '../../schemas/common.schema';
import { BEHAVIOR_TYPES } from '../../types/enums';

export const createBehaviorSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  classId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  type: z.enum(BEHAVIOR_TYPES),
  title: requiredString(200, 'Title'),
  description: nullableString(2000),
  occurredOn: dateSchema.optional(),
  points: z.coerce.number().int().min(-100).max(100).optional(),
  actionTaken: nullableString(1000),
  visibleToParent: z.boolean().optional(),
});

export const updateBehaviorSchema = createBehaviorSchema
  .omit({ studentId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listBehaviorsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  studentId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  type: z.enum(BEHAVIOR_TYPES).optional(),
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,
  visibleToParentOnly: booleanQuerySchema,
});

export const createCommentSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  termId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  classId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  subjectId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  isHomeroom: z.boolean().optional(),
  comment: requiredString(2000, 'Comment'),
  visibleToParent: z.boolean().optional(),
});

export const listCommentsQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  termId: z.coerce.number().int().positive().optional(),
  visibleToParentOnly: booleanQuerySchema,
});

export const behaviorSummaryQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
});

export type CreateBehaviorBody = z.infer<typeof createBehaviorSchema>;
export type UpdateBehaviorBody = z.infer<typeof updateBehaviorSchema>;
export type ListBehaviorsQuery = z.infer<typeof listBehaviorsQuerySchema>;
export type CreateCommentBody = z.infer<typeof createCommentSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
export type BehaviorSummaryQuery = z.infer<typeof behaviorSummaryQuerySchema>;
