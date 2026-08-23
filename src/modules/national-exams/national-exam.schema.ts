import { z } from 'zod';
import { dateSchema, requiredString } from '../../schemas/common.schema';

const nationalExamGrade = z.enum(['A', 'B', 'C', 'D', 'E', 'F']);

const registrationStatus = z.enum([
  'NOT_REGISTERED',
  'REGISTERED',
  'ADMITTED',
  'SAT',
  'ABSENT',
  'RESULT_PUBLISHED',
]);

export const createSessionSchema = z.object({
  academicYearId: z.coerce.number().int().positive(),
  name: requiredString(120, 'Session name'),
  centreName: z.string().max(150).optional().nullable(),
  centreCode: z.string().max(50).optional().nullable(),
  startsOn: dateSchema,
  endsOn: dateSchema,
  registrationDeadline: dateSchema.optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateSessionSchema = z
  .object({
    name: requiredString(120, 'Session name').optional(),
    centreName: z.string().max(150).optional().nullable(),
    centreCode: z.string().max(50).optional().nullable(),
    startsOn: dateSchema.optional(),
    endsOn: dateSchema.optional(),
    registrationDeadline: dateSchema.optional().nullable(),
    isOpen: z.boolean().optional(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listSessionsQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
});

export const registerCandidateSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  seatNumber: z.string().max(50).optional().nullable(),
  remarks: z.string().max(2000).optional().nullable(),
});

export const updateRegistrationSchema = z
  .object({
    seatNumber: z.string().max(50).optional().nullable(),
    status: registrationStatus.optional(),
    remarks: z.string().max(2000).optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listRegistrationsQuerySchema = z.object({
  sessionId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  status: registrationStatus.optional(),
  search: z.string().max(120).optional(),
});

const subjectScoreSchema = z.object({
  subjectId: z.coerce.number().int().positive(),
  score: z.coerce.number().min(0),
  maxScore: z.coerce.number().positive().optional(),
});

export const publishResultSchema = z.object({
  resultGrade: nationalExamGrade,
  totalScore: z.coerce.number().min(0).max(1000).optional().nullable(),
  isPass: z.boolean().optional(),
  publishedOn: dateSchema.optional(),
  subjectScores: z.array(subjectScoreSchema).max(20).optional(),
});

export const amendResultSchema = publishResultSchema.extend({
  reason: requiredString(500, 'Amendment reason'),
});

export type CreateSessionBody = z.infer<typeof createSessionSchema>;
export type UpdateSessionBody = z.infer<typeof updateSessionSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
export type RegisterCandidateBody = z.infer<typeof registerCandidateSchema>;
export type UpdateRegistrationBody = z.infer<typeof updateRegistrationSchema>;
export type ListRegistrationsQuery = z.infer<typeof listRegistrationsQuerySchema>;
export type PublishResultBody = z.infer<typeof publishResultSchema>;
export type AmendResultBody = z.infer<typeof amendResultSchema>;
