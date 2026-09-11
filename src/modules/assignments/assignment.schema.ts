import { z } from 'zod';
import {
  booleanQuerySchema,
  dateSchema,
  nullableString,
  optionalDateSchema,
  paginationQuerySchema,
  requiredString,
} from '../../schemas/common.schema';
import { ASSIGNMENT_STATUSES } from '../../types/enums';

export const createAssignmentSchema = z.object({
  classId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
  termId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  title: requiredString(200, 'Title'),
  description: nullableString(2000),
  instructions: nullableString(5000),
  attachmentUrl: nullableString(500),
  assignedDate: dateSchema.optional(),
  dueDate: dateSchema,
  maxScore: z.union([z.coerce.number().positive().max(1000), z.null()]).optional(),
  publishNow: z.boolean().optional(),
  /**
   * Who the homework belongs to. Omitted when a teacher sets their own, which
   * the service fills from the token.
   *
   * This was missing while the service had a field for it, and Zod strips what
   * it does not declare — so homework recorded on a teacher's behalf was saved
   * against nobody, silently, and there was then no one to tell when a pupil
   * handed it in.
   */
  teacherId: z.coerce.number().int().positive().optional(),
});

export const updateAssignmentSchema = createAssignmentSchema
  .omit({ classId: true, subjectId: true, publishNow: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listAssignmentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  teacherId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
  dueFrom: optionalDateSchema,
  dueTo: optionalDateSchema,
  pendingOnly: booleanQuerySchema,
});

export const gradeSubmissionsSchema = z.object({
  results: z
    .array(
      z.object({
        studentId: z.coerce.number().int().positive(),
        score: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
        feedback: nullableString(2000),
      }),
    )
    .min(1)
    .max(200),
});

export const submitAssignmentSchema = z.object({
  studentId: z.coerce.number().int().positive().optional(),
  content: nullableString(5000),
  attachmentUrl: nullableString(500),
});

export type CreateAssignmentBody = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentBody = z.infer<typeof updateAssignmentSchema>;
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;
export type GradeSubmissionsBody = z.infer<typeof gradeSubmissionsSchema>;
export type SubmitAssignmentBody = z.infer<typeof submitAssignmentSchema>;
