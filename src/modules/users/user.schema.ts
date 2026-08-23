import { z } from 'zod';
import {
  emailSchema,
  paginationQuerySchema,
  passwordSchema,
  requiredString,
} from '../../schemas/common.schema';
import { ROLE_CODES, USER_STATUSES } from '../../types/enums';

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(100, 'Username must be at most 100 characters')
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'Username may only contain letters, digits, dots, underscores and hyphens',
  );

export const createUserSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  status: z.enum(USER_STATUSES).optional(),
  roleCodes: z
    .array(z.enum(ROLE_CODES))
    .min(1, 'At least one role must be assigned')
    .max(ROLE_CODES.length),
});

export const updateUserSchema = z
  .object({
    username: usernameSchema.optional(),
    email: emailSchema.optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const updateUserStatusSchema = z.object({
  status: z.enum(USER_STATUSES),
});

export const assignRolesSchema = z.object({
  roleCodes: z.array(z.enum(ROLE_CODES)).min(1, 'At least one role must be assigned'),
});

export const resetUserPasswordSchema = z.object({
  password: passwordSchema.optional(),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: requiredString(255, 'Search').optional(),
  status: z.enum(USER_STATUSES).optional(),
  roleCode: z.enum(ROLE_CODES).optional(),
});

export type CreateUserBody = z.infer<typeof createUserSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
export type UpdateUserStatusBody = z.infer<typeof updateUserStatusSchema>;
export type AssignRolesBody = z.infer<typeof assignRolesSchema>;
export type ResetUserPasswordBody = z.infer<typeof resetUserPasswordSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
