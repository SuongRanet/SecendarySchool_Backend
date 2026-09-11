import { z } from 'zod';
import {
  booleanQuerySchema,
  nullableString,
  paginationQuerySchema,
  requiredString,
} from '../../schemas/common.schema';

const classSubjectInputSchema = z.object({
  subjectId: z.coerce.number().int().positive(),
  teacherId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  weight: z.coerce.number().positive().max(100).optional(),
  isActive: z.boolean().optional(),
});

export const createClassSchema = z.object({
  academicYearId: z.coerce.number().int().positive(),
  gradeLevelId: z.coerce.number().int().positive(),
  code: requiredString(40, 'Class code'),
  name: requiredString(100, 'Class name'),
  homeroomTeacherId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  roomId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  capacity: z.coerce.number().int().positive().max(200).optional(),
  description: nullableString(500),
  isActive: z.boolean().optional(),
  subjects: z.array(classSubjectInputSchema).max(30).optional(),
});

export const updateClassSchema = createClassSchema
  .omit({ academicYearId: true, subjects: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listClassesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  gradeLevelId: z.coerce.number().int().positive().optional(),
  homeroomTeacherId: z.coerce.number().int().positive().optional(),
  teacherId: z.coerce.number().int().positive().optional(),
  isActive: booleanQuerySchema,
});

export const assignClassSubjectSchema = classSubjectInputSchema;

export const replaceClassSubjectsSchema = z.object({
  subjects: z.array(classSubjectInputSchema).max(30),
});

export const classStudentsQuerySchema = z.object({
  includeInactive: booleanQuerySchema,
});

export const classSubjectParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  classSubjectId: z.coerce.number().int().positive(),
});

export type CreateClassBody = z.infer<typeof createClassSchema>;
export type UpdateClassBody = z.infer<typeof updateClassSchema>;
export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>;
export type AssignClassSubjectBody = z.infer<typeof assignClassSubjectSchema>;
export type ReplaceClassSubjectsBody = z.infer<typeof replaceClassSubjectsSchema>;
export type ClassStudentsQuery = z.infer<typeof classStudentsQuerySchema>;

/**
 * `mine=true` narrows a class's subject list to the ones the caller teaches.
 *
 * Used by the screens where a teacher writes marks, so the picker cannot offer
 * a subject the save would then refuse.
 */
export const classSubjectsQuerySchema = z.object({
  mine: booleanQuerySchema,
});
