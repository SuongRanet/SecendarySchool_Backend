import { z } from 'zod';
import { booleanQuerySchema, nullableString, paginationQuerySchema } from '../../schemas/common.schema';
import { ASSESSMENT_TYPES, PERFORMANCE_LEVELS } from '../../types/enums';

export const listGradesQuerySchema = paginationQuerySchema.extend({
  academicYearId: z.coerce.number().int().positive().optional(),
  termId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  isFinal: booleanQuerySchema,
});

export const calculateGradesSchema = z.object({
  classId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
  termId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});

export const generateGradesSchema = calculateGradesSchema.extend({
  isFinal: z.boolean().optional(),
});

const gradeEntrySchema = z.object({
  studentId: z.coerce.number().int().positive(),
  classId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
  termId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  score: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
  maxScore: z.coerce.number().positive().max(1000).optional(),
  teacherComment: nullableString(1000),
  isFinal: z.boolean().optional(),
  reason: nullableString(255),
});

export const saveGradeSchema = gradeEntrySchema;

export const saveManyGradesSchema = z.object({
  grades: z.array(gradeEntrySchema).min(1).max(200),
});

export const updateGradingSchemeSchema = z
  .object({
    components: z
      .array(
        z.object({
          assessmentType: z.enum(ASSESSMENT_TYPES),
          weightPercent: z.coerce.number().positive().max(100),
        }),
      )
      .min(1)
      .max(10)
      .optional(),
    scales: z
      .array(
        z.object({
          letterGrade: z.string().trim().min(1).max(2),
          minScore: z.coerce.number().min(0).max(100),
          maxScore: z.coerce.number().min(0).max(100),
          gpaPoint: z.union([z.coerce.number().min(0).max(5), z.null()]).optional(),
          performance: z.enum(PERFORMANCE_LEVELS),
          remarkEn: nullableString(120),
        }),
      )
      .min(1)
      .max(15)
      .optional(),
  })
  .refine((value) => value.components || value.scales, {
    message: 'Provide components, scales, or both',
  });

export const studentGradesQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  termId: z.coerce.number().int().positive().optional(),
});

export const classAveragesQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive(),
  termId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
});

export type ListGradesQuery = z.infer<typeof listGradesQuerySchema>;
export type CalculateGradesBody = z.infer<typeof calculateGradesSchema>;
export type GenerateGradesBody = z.infer<typeof generateGradesSchema>;
export type SaveGradeBody = z.infer<typeof saveGradeSchema>;
export type SaveManyGradesBody = z.infer<typeof saveManyGradesSchema>;
export type UpdateGradingSchemeBody = z.infer<typeof updateGradingSchemeSchema>;
export type StudentGradesQuery = z.infer<typeof studentGradesQuerySchema>;
export type ClassAveragesQuery = z.infer<typeof classAveragesQuerySchema>;
