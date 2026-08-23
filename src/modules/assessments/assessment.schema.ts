import { z } from 'zod';
import {
  booleanQuerySchema,
  nullableString,
  optionalDateSchema,
  paginationQuerySchema,
  requiredString,
} from '../../schemas/common.schema';
import { ASSESSMENT_TYPES } from '../../types/enums';

export const createAssessmentSchema = z.object({
  classId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
  termId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  teacherId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  title: requiredString(200, 'Title'),
  description: nullableString(1000),
  type: z.enum(ASSESSMENT_TYPES),
  maxScore: z.coerce.number().positive().max(1000),
  weightPercent: z.union([z.coerce.number().positive().max(100), z.null()]).optional(),
  assessmentDate: optionalDateSchema,
  isPublished: z.boolean().optional(),
});

export const updateAssessmentSchema = createAssessmentSchema
  .omit({ classId: true, subjectId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listAssessmentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  termId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  teacherId: z.coerce.number().int().positive().optional(),
  type: z.enum(ASSESSMENT_TYPES).optional(),
  isPublished: booleanQuerySchema,
});

export const saveResultsSchema = z.object({
  results: z
    .array(
      z.object({
        studentId: z.coerce.number().int().positive(),
        score: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
        isAbsent: z.boolean().optional(),
        feedback: nullableString(1000),
      }),
    )
    .min(1, 'At least one result must be provided')
    .max(200),
});

export const setPublishedSchema = z.object({
  isPublished: z.boolean(),
});

export type CreateAssessmentBody = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentBody = z.infer<typeof updateAssessmentSchema>;
export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;
export type SaveResultsBody = z.infer<typeof saveResultsSchema>;
export type SetPublishedBody = z.infer<typeof setPublishedSchema>;
