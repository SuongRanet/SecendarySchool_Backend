import { z } from 'zod';
import { dateSchema, paginationQuerySchema, requiredString } from '../../schemas/common.schema';
import { ACADEMIC_YEAR_STATUSES } from '../../types/enums';

export const createAcademicYearSchema = z.object({
  name: requiredString(50, 'Academic year name'),
  startDate: dateSchema,
  endDate: dateSchema,
  setActive: z.boolean().optional(),
});

export const updateAcademicYearSchema = z
  .object({
    name: requiredString(50, 'Academic year name').optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listAcademicYearsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(50).optional(),
  status: z.enum(ACADEMIC_YEAR_STATUSES).optional(),
});

export const createTermSchema = z.object({
  name: requiredString(80, 'Term name'),
  termOrder: z.coerce.number().int().positive().max(12),
  startDate: dateSchema,
  endDate: dateSchema,
});

export const updateTermSchema = createTermSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field must be provided' },
);

export const termIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  termId: z.coerce.number().int().positive(),
});

export type CreateAcademicYearBody = z.infer<typeof createAcademicYearSchema>;
export type UpdateAcademicYearBody = z.infer<typeof updateAcademicYearSchema>;
export type ListAcademicYearsQuery = z.infer<typeof listAcademicYearsQuerySchema>;
export type CreateTermBody = z.infer<typeof createTermSchema>;
export type UpdateTermBody = z.infer<typeof updateTermSchema>;
