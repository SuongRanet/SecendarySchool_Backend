import { z } from 'zod';
import { nullableString, requiredString } from '../../schemas/common.schema';

export const updateRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string().trim().min(1).max(100)).max(300),
});

export const updateRoleSchema = z
  .object({
    name: requiredString(100, 'Role name').optional(),
    description: nullableString(500),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateRolePermissionsBody = z.infer<typeof updateRolePermissionsSchema>;
export type UpdateRoleBody = z.infer<typeof updateRoleSchema>;
