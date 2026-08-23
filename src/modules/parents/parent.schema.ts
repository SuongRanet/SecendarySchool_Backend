import { z } from 'zod';
import {
  booleanQuerySchema,
  nullableString,
  optionalDateSchema,
  optionalEmailSchema,
  optionalPhoneSchema,
  paginationQuerySchema,
  passwordSchema,
  requiredString,
} from '../../schemas/common.schema';
import { GENDERS, GUARDIAN_RELATIONSHIPS } from '../../types/enums';

const accountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, digits, dots, underscores and hyphens'),
  email: z.string().trim().toLowerCase().email('Invalid email address').max(255),
  password: passwordSchema,
});

const childLinkSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  relationship: z.enum(GUARDIAN_RELATIONSHIPS).optional(),
  isPrimaryContact: z.boolean().optional(),
  isEmergencyContact: z.boolean().optional(),
  canPickUp: z.boolean().optional(),
});

export const createParentSchema = z.object({
  parentCode: z.string().trim().max(30).optional(),
  firstNameEn: requiredString(100, 'First name'),
  lastNameEn: requiredString(100, 'Last name'),
  firstNameKh: nullableString(100),
  lastNameKh: nullableString(100),
  gender: z.enum(GENDERS).nullish(),
  dateOfBirth: optionalDateSchema,
  nationalId: nullableString(50),
  phoneNumber: optionalPhoneSchema,
  alternatePhone: optionalPhoneSchema,
  email: optionalEmailSchema,
  occupation: nullableString(150),
  workplace: nullableString(150),
  address: nullableString(500),
  province: nullableString(100),
  profilePhoto: nullableString(500),
  isActive: z.boolean().optional(),
  children: z.array(childLinkSchema).max(20).optional(),
  account: accountSchema.optional(),
});

export const updateParentSchema = createParentSchema
  .omit({ children: true, account: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listParentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(150).optional(),
  isActive: booleanQuerySchema,
  studentId: z.coerce.number().int().positive().optional(),
  hasAccount: booleanQuerySchema,
  includeArchived: booleanQuerySchema,
});

export const linkChildSchema = childLinkSchema;

export const parentChildParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  studentId: z.coerce.number().int().positive(),
});

export const createParentAccountSchema = accountSchema;

export type CreateParentBody = z.infer<typeof createParentSchema>;
export type UpdateParentBody = z.infer<typeof updateParentSchema>;
export type ListParentsQuery = z.infer<typeof listParentsQuerySchema>;
export type LinkChildBody = z.infer<typeof linkChildSchema>;
export type CreateParentAccountBody = z.infer<typeof createParentAccountSchema>;
