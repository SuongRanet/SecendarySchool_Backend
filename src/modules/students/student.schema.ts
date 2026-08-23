import { z } from 'zod';
import {
  booleanQuerySchema,
  dateSchema,
  nullableString,
  optionalDateSchema,
  optionalEmailSchema,
  optionalPhoneSchema,
  paginationQuerySchema,
  passwordSchema,
  requiredString,
} from '../../schemas/common.schema';
import { GENDERS, GUARDIAN_RELATIONSHIPS, STUDENT_STATUSES } from '../../types/enums';

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

const parentLinkSchema = z.object({
  parentId: z.coerce.number().int().positive(),
  relationship: z.enum(GUARDIAN_RELATIONSHIPS).optional(),
  isPrimaryContact: z.boolean().optional(),
  isEmergencyContact: z.boolean().optional(),
  canPickUp: z.boolean().optional(),
});

export const createStudentSchema = z.object({
  studentCode: z.string().trim().max(30).optional(),
  firstNameEn: requiredString(100, 'First name'),
  lastNameEn: requiredString(100, 'Last name'),
  firstNameKh: nullableString(100),
  lastNameKh: nullableString(100),
  gender: z.enum(GENDERS).nullish(),
  dateOfBirth: optionalDateSchema,
  placeOfBirth: nullableString(150),
  nationalId: nullableString(50),
  phoneNumber: optionalPhoneSchema,
  email: optionalEmailSchema,
  currentAddress: nullableString(500),
  province: nullableString(100),
  profilePhoto: nullableString(500),
  enrolledDate: optionalDateSchema,
  status: z.enum(STUDENT_STATUSES).optional(),
  notes: nullableString(1000),
  enrollment: z
    .object({
      academicYearId: z.coerce.number().int().positive(),
      classId: z.coerce.number().int().positive(),
      rollNumber: nullableString(20),
      enrolledDate: dateSchema.optional(),
    })
    .optional(),
  parents: z.array(parentLinkSchema).max(10).optional(),
  account: accountSchema.optional(),
});

export const updateStudentSchema = createStudentSchema
  .omit({ enrollment: true, parents: true, account: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listStudentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(150).optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
  gender: z.enum(GENDERS).optional(),
  gradeLevelId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  parentId: z.coerce.number().int().positive().optional(),
  includeArchived: booleanQuerySchema,
});

export const linkParentSchema = parentLinkSchema;

export const studentParentParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  parentId: z.coerce.number().int().positive(),
});

export const createStudentAccountSchema = accountSchema;

export type CreateStudentBody = z.infer<typeof createStudentSchema>;
export type UpdateStudentBody = z.infer<typeof updateStudentSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type LinkParentBody = z.infer<typeof linkParentSchema>;
export type CreateStudentAccountBody = z.infer<typeof createStudentAccountSchema>;
