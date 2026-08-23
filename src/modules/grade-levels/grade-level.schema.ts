import { z } from 'zod';
import { booleanQuerySchema, nullableString, requiredString } from '../../schemas/common.schema';

export const createGradeLevelSchema = z.object({
  code: requiredString(20, 'Code'),
  nameEn: requiredString(100, 'Name'),
  nameKh: nullableString(100),
  levelOrder: z.coerce.number().int().positive().max(20),
  description: nullableString(500),
  isActive: z.boolean().optional(),
});

export const updateGradeLevelSchema = createGradeLevelSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listGradeLevelsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  isActive: booleanQuerySchema,
});

export const reorderGradeLevelsSchema = z.object({
  order: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        levelOrder: z.coerce.number().int().positive().max(20),
      }),
    )
    .min(1, 'At least one grade level must be provided'),
});

export type CreateGradeLevelBody = z.infer<typeof createGradeLevelSchema>;
export type UpdateGradeLevelBody = z.infer<typeof updateGradeLevelSchema>;
export type ListGradeLevelsQuery = z.infer<typeof listGradeLevelsQuerySchema>;
export type ReorderGradeLevelsBody = z.infer<typeof reorderGradeLevelsSchema>;
