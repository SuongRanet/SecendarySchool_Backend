import { z } from 'zod';
import {
  booleanQuerySchema,
  nullableString,
  paginationQuerySchema,
  requiredString,
} from '../../schemas/common.schema';

export const createSubjectSchema = z.object({
  code: requiredString(30, 'Code'),
  nameEn: requiredString(120, 'Name'),
  nameKh: nullableString(120),
  description: nullableString(500),
  isActive: z.boolean().optional(),
  gradeLevelIds: z.array(z.coerce.number().int().positive()).max(20).optional(),
});

export const updateSubjectSchema = createSubjectSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listSubjectsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  isActive: booleanQuerySchema,
  gradeLevelId: z.coerce.number().int().positive().optional(),
});

export const setSubjectActiveSchema = z.object({
  isActive: z.boolean(),
});

export type CreateSubjectBody = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectBody = z.infer<typeof updateSubjectSchema>;
export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>;
export type SetSubjectActiveBody = z.infer<typeof setSubjectActiveSchema>;
