import { z } from 'zod';
import { nullableString, paginationQuerySchema } from '../../schemas/common.schema';
import { REPORT_CARD_STATUSES } from '../../types/enums';

export const listReportCardsQuerySchema = paginationQuerySchema.extend({
  academicYearId: z.coerce.number().int().positive().optional(),
  termId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  status: z.enum(REPORT_CARD_STATUSES).optional(),
});

export const generateReportCardsSchema = z.object({
  classId: z.coerce.number().int().positive(),
  termId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  studentIds: z.array(z.coerce.number().int().positive()).max(200).optional(),
  publish: z.boolean().optional(),
});

export const updateReportCardSchema = z
  .object({
    teacherComment: nullableString(2000),
    homeroomComment: nullableString(2000),
    principalComment: nullableString(2000),
    subjectComments: z
      .array(
        z.object({
          subjectId: z.coerce.number().int().positive(),
          comment: nullableString(1000),
        }),
      )
      .max(30)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const setReportCardStatusSchema = z.object({
  status: z.enum(REPORT_CARD_STATUSES),
});

export const publishClassSchema = z.object({
  classId: z.coerce.number().int().positive(),
  termId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});

export const studentReportCardQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive(),
  termId: z.coerce.number().int().positive().optional(),
});

export type ListReportCardsQuery = z.infer<typeof listReportCardsQuerySchema>;
export type GenerateReportCardsBody = z.infer<typeof generateReportCardsSchema>;
export type UpdateReportCardBody = z.infer<typeof updateReportCardSchema>;
export type SetReportCardStatusBody = z.infer<typeof setReportCardStatusSchema>;
export type PublishClassBody = z.infer<typeof publishClassSchema>;
export type StudentReportCardQuery = z.infer<typeof studentReportCardQuerySchema>;
