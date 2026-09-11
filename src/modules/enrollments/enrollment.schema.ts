import { z } from 'zod';
import {
  dateSchema,
  nullableString,
  optionalDateSchema,
  paginationQuerySchema,
} from '../../schemas/common.schema';
import { ENROLLMENT_STATUSES } from '../../types/enums';

export const createEnrollmentSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  academicYearId: z.coerce.number().int().positive(),
  classId: z.coerce.number().int().positive(),
  rollNumber: nullableString(20),
  enrolledDate: dateSchema.optional(),
  remarks: nullableString(500),
});

export const transferEnrollmentSchema = z.object({
  classId: z.coerce.number().int().positive(),
  effectiveDate: dateSchema.optional(),
  rollNumber: nullableString(20),
  remarks: nullableString(500),
});

export const withdrawEnrollmentSchema = z.object({
  endDate: optionalDateSchema,
  status: z.enum(['WITHDRAWN', 'TRANSFERRED', 'COMPLETED']).optional(),
  remarks: nullableString(500),
  updateStudentStatus: z.boolean().optional(),
});

export const updateEnrollmentSchema = z
  .object({
    rollNumber: nullableString(20),
    remarks: nullableString(500),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listEnrollmentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(150).optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  gradeLevelId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  status: z.enum(ENROLLMENT_STATUSES).optional(),
});

export const promoteCohortSchema = z.object({
  fromAcademicYearId: z.coerce.number().int().positive(),
  toAcademicYearId: z.coerce.number().int().positive(),
  classMapping: z
    .array(
      z.object({
        fromClassId: z.coerce.number().int().positive(),
        toClassId: z.coerce.number().int().positive(),
      }),
    )
    .min(1, 'At least one class mapping is required')
    .max(60),
  excludeStudentIds: z.array(z.coerce.number().int().positive()).max(2000).optional(),
  enrolledDate: optionalDateSchema,
});

export const enrollmentStatsQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive(),
});

export type CreateEnrollmentBody = z.infer<typeof createEnrollmentSchema>;
export type TransferEnrollmentBody = z.infer<typeof transferEnrollmentSchema>;
export type WithdrawEnrollmentBody = z.infer<typeof withdrawEnrollmentSchema>;
export type UpdateEnrollmentBody = z.infer<typeof updateEnrollmentSchema>;
export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuerySchema>;
export const graduateCohortSchema = z.object({
  academicYearId: z.coerce.number().int().positive(),
  excludeStudentIds: z.array(z.coerce.number().int().positive()).max(2000).optional(),
});

export type PromoteCohortBody = z.infer<typeof promoteCohortSchema>;
export type GraduateCohortBody = z.infer<typeof graduateCohortSchema>;
export type EnrollmentStatsQuery = z.infer<typeof enrollmentStatsQuerySchema>;
