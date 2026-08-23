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
import { GENDERS, STAFF_STATUSES } from '../../types/enums';

const accountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, digits, dots, underscores and hyphens'),
  email: z.string().trim().toLowerCase().email('Invalid email address').max(255),
  password: passwordSchema,
  isHomeroomTeacher: z.boolean().optional(),
});

export const createTeacherSchema = z.object({
  teacherCode: z.string().trim().max(30).optional(),
  firstNameEn: requiredString(100, 'First name'),
  lastNameEn: requiredString(100, 'Last name'),
  firstNameKh: nullableString(100),
  lastNameKh: nullableString(100),
  gender: z.enum(GENDERS).nullish(),
  dateOfBirth: optionalDateSchema,
  nationalId: nullableString(50),
  phoneNumber: optionalPhoneSchema,
  email: optionalEmailSchema,
  address: nullableString(500),
  qualification: nullableString(150),
  specialization: nullableString(150),
  hireDate: optionalDateSchema,
  status: z.enum(STAFF_STATUSES).optional(),
  profilePhoto: nullableString(500),
  notes: nullableString(1000),
  subjectIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
  account: accountSchema.optional(),
});

export const updateTeacherSchema = createTeacherSchema
  .omit({ account: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listTeachersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(150).optional(),
  status: z.enum(STAFF_STATUSES).optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  hasAccount: booleanQuerySchema,
  includeArchived: booleanQuerySchema,
});

export const assignSubjectsSchema = z.object({
  subjectIds: z.array(z.coerce.number().int().positive()).max(50),
});

export const createTeacherAccountSchema = accountSchema;

export const teacherScopeQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
});

export type CreateTeacherBody = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherBody = z.infer<typeof updateTeacherSchema>;
export type ListTeachersQuery = z.infer<typeof listTeachersQuerySchema>;
export type AssignSubjectsBody = z.infer<typeof assignSubjectsSchema>;
export type CreateTeacherAccountBody = z.infer<typeof createTeacherAccountSchema>;
export type TeacherScopeQuery = z.infer<typeof teacherScopeQuerySchema>;
