import { withTransaction } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import { PERMISSIONS } from '../../config/permissions';
import { hasPermission, isElevated } from '../../middleware/role.middleware';
import type {
  AuditContext,
  AuthenticatedUser,
  PaginatedResult,
  PaginationParams,
  PerformanceLevel,
} from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as assessmentRepository from '../assessments/assessment.repository';
import * as academicYearRepository from '../academic-years/academic-year.repository';
import * as classRepository from '../classes/class.repository';
import * as enrollmentRepository from '../enrollments/enrollment.repository';
import * as teacherRepository from '../teachers/teacher.repository';
import * as repository from './grade.repository';
import type {
  CalculatedGrade,
  GradeDto,
  GradeFilters,
  GradeHistoryEntry,
  GradeRow,
  GradeScaleRow,
  GradingComponentRow,
  GradingSchemeDto,
} from './grade.types';

const toDto = (row: GradeRow): GradeDto => ({
  id: row.id,
  studentId: row.student_id,
  studentCode: row.student_code ?? '',
  studentName: `${row.student_first_name ?? ''} ${row.student_last_name ?? ''}`.trim(),
  academicYearId: row.academic_year_id,
  academicYearName: row.academic_year_name ?? '',
  termId: row.term_id,
  termName: row.term_name ?? null,
  classId: row.class_id,
  className: row.class_name ?? '',
  subjectId: row.subject_id,
  subjectName: row.subject_name ?? '',
  score: row.score,
  maxScore: row.max_score,
  percentage: row.percentage,
  letterGrade: row.letter_grade,
  performance: row.performance,
  gpaPoint: row.gpa_point,
  rankInClass: row.rank_in_class,
  teacherComment: row.teacher_comment,
  isFinal: row.is_final,
  calculatedAt: row.calculated_at,
  updatedAt: row.updated_at,
});

/**
 * Converts a percentage into the letter grade, performance level and GPA point of
 * a grading scheme. The scale is data, not code, so a school can change its
 * boundaries without a deployment.
 */
export const applyScale = (
  percentage: number | null,
  scales: GradeScaleRow[],
): { letterGrade: string | null; performance: PerformanceLevel | null; gpaPoint: number | null } => {
  if (percentage === null) {
    return { letterGrade: null, performance: null, gpaPoint: null };
  }

  const match = scales.find(
    (scale) => percentage >= Number(scale.min_score) && percentage <= Number(scale.max_score),
  );

  if (!match) {
    return { letterGrade: null, performance: null, gpaPoint: null };
  }

  return {
    letterGrade: match.letter_grade,
    performance: match.performance,
    gpaPoint: match.gpa_point,
  };
};

const loadScheme = async (executor?: Queryable) => {
  const scheme = await repository.findDefaultGradingScheme(executor);

  if (!scheme) {
    throw AppError.conflict(
      'No default grading scheme is configured. Create one before calculating grades.',
      'NO_GRADING_SCHEME',
    );
  }

  const [components, scales] = await Promise.all([
    repository.findComponents(scheme.id, executor),
    repository.findScales(scheme.id, executor),
  ]);

  return { scheme, components, scales };
};

/** A teacher may only enter grades for a class subject they are assigned to. */
export const assertCanEnterGrades = async (
  user: AuthenticatedUser,
  classId: number,
  subjectId: number,
): Promise<void> => {
  if (isElevated(user) || hasPermission(user, PERMISSIONS.GRADES_UPDATE_ANY)) {
    return;
  }

  if (!user.teacherId) {
    throw AppError.forbidden(
      'Only the teacher assigned to this class subject can enter its grades',
      'GRADE_ACCESS_DENIED',
    );
  }

  const teaches = await teacherRepository.teacherTeachesSubject(user.teacherId, classId, subjectId);

  if (!teaches) {
    throw AppError.forbidden(
      'You are not assigned to teach this subject in this class',
      'GRADE_ACCESS_DENIED',
    );
  }
};

export const list = async (
  filters: GradeFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<GradeDto>> => {
  const result = await repository.findGrades(filters, pagination);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const listForStudent = async (
  studentId: number,
  filters: { academicYearId?: number; termId?: number },
): Promise<GradeDto[]> => {
  const rows = await repository.findAllGrades({ ...filters, studentId });
  return rows.map(toDto);
};

export const getById = async (id: number): Promise<GradeDto> => {
  const row = await repository.findGradeById(id);

  if (!row) {
    throw AppError.notFound('Grade not found', 'GRADE_NOT_FOUND');
  }

  return toDto(row);
};

/**
 * Combines one student's assessment totals into a weighted subject percentage,
 * using the configured component weights (Homework 10%, Quiz 20%, Midterm 30%,
 * Final 40% by default).
 *
 * A component with no graded assessment contributes nothing and its weight is
 * excluded from the divisor, so a mid-term calculation is rescaled to the work
 * that has actually been marked rather than being dragged down by work that has
 * not happened yet.
 */
export const computeWeightedPercentage = (
  components: GradingComponentRow[],
  aggregates: { type: string; earned: number; possible: number }[],
): { percentage: number | null; breakdown: CalculatedGrade['componentBreakdown'] } => {
  const byType = new Map(aggregates.map((row) => [row.type, row]));
  const breakdown: CalculatedGrade['componentBreakdown'] = [];
  let weightedSum = 0;
  let usedWeight = 0;

  for (const component of components) {
    const aggregate = byType.get(component.assessment_type);
    const possible = aggregate ? Number(aggregate.possible) : 0;
    const earned = aggregate ? Number(aggregate.earned) : 0;
    const percent = possible > 0 ? (earned / possible) * 100 : null;
    const weight = Number(component.weight_percent);

    if (percent !== null) {
      weightedSum += (percent * weight) / 100;
      usedWeight += weight;
    }

    breakdown.push({
      assessmentType: component.assessment_type,
      weightPercent: weight,
      earned,
      possible,
      percent: percent === null ? null : Number(percent.toFixed(2)),
      weighted: percent === null ? null : Number(((percent * weight) / 100).toFixed(2)),
    });
  }

  return {
    percentage: usedWeight > 0 ? Number(((weightedSum / usedWeight) * 100).toFixed(2)) : null,
    breakdown,
  };
};

/**
 * Calculates the weighted subject grade for every student in a class from their
 * assessment results.
 */
export const calculateForClass = async (
  classId: number,
  subjectId: number,
  termId: number | null,
): Promise<CalculatedGrade[]> => {
  const classRow = await classRepository.findClassById(classId);

  if (!classRow) {
    throw AppError.notFound('Class not found', 'CLASS_NOT_FOUND');
  }

  const { components, scales } = await loadScheme();
  const students = await classRepository.findClassStudents(classId);
  const calculated: CalculatedGrade[] = [];

  for (const student of students) {
    const aggregates = await assessmentRepository.aggregateForGrade(
      student.student_id,
      classId,
      subjectId,
      termId,
    );

    const { percentage, breakdown } = computeWeightedPercentage(components, aggregates);
    const scaled = applyScale(percentage, scales);

    calculated.push({
      studentId: student.student_id,
      studentCode: student.student_code,
      studentName: `${student.first_name_en} ${student.last_name_en}`.trim(),
      componentBreakdown: breakdown,
      percentage,
      ...scaled,
    });
  }

  return calculated;
};

/** Calculates and persists the subject grades of a whole class. */
/**
 * Every grade belongs to a term.
 *
 * A caller that does not name one used to have its grades stored with no term
 * at all, which produced a second, parallel set of grades sitting alongside the
 * real ones — the same subject listed twice, once against the term and once
 * against nothing. The school is always teaching some term, so resolve it
 * rather than recording a grade that belongs to no part of the year.
 */
const resolveTermId = async (
  academicYearId: number,
  termId: number | null,
): Promise<number | null> => {
  if (termId) {
    return termId;
  }

  const active = await academicYearRepository.findActiveTerm(academicYearId);

  return active?.id ?? null;
};

export const generateForClass = async (
  classId: number,
  subjectId: number,
  termId: number | null,
  isFinal: boolean,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<GradeDto[]> => {
  await assertCanEnterGrades(user, classId, subjectId);

  const classRow = await classRepository.findClassById(classId);

  if (!classRow) {
    throw AppError.notFound('Class not found', 'CLASS_NOT_FOUND');
  }

  if (classRow.academic_year_status === 'CLOSED') {
    throw AppError.conflict('The academic year of this class is closed', 'ACADEMIC_YEAR_CLOSED');
  }

  const term = await resolveTermId(classRow.academic_year_id, termId);

  /**
   * Nothing to calculate is not the same as everyone scoring nothing.
   *
   * Generating a grade for a term with no assessment used to write one empty
   * row per student — no score, no letter, yet a rank — which then showed up on
   * report cards as though the subject had been graded. Refuse instead, and say
   * which of the two things is missing so the teacher knows what to do next.
   */
  const readiness = await assessmentRepository.countForGrading(classId, subjectId, term);

  if (readiness.assessments === 0) {
    throw AppError.badRequest(
      'No assessment has been recorded for this subject in this term, so there is nothing to grade yet',
      'NO_ASSESSMENTS_TO_GRADE',
    );
  }

  if (readiness.marked === 0) {
    throw AppError.badRequest(
      'The assessments for this subject have no marks entered yet, so there is nothing to grade',
      'NO_MARKS_TO_GRADE',
    );
  }

  const calculated = await calculateForClass(classId, subjectId, term);
  const { scheme } = await loadScheme();
  const enrolled = await enrollmentRepository.findActiveEnrollmentsByClass(classId);
  const enrollmentByStudent = new Map(enrolled.map((row) => [row.student_id, row.id]));

  await withTransaction(async (client) => {
    for (const entry of calculated) {
      // A student with no marks in a subject that has been assessed has simply
      // not been marked yet. Recording a blank grade for them would claim they
      // were graded, so leave them out until a mark exists.
      if (entry.percentage === null) {
        continue;
      }

      const existing = await repository.findGrade(
        entry.studentId,
        classRow.academic_year_id,
        term,
        subjectId,
        client,
      );

      const gradeId = await repository.upsertGrade(
        {
          studentId: entry.studentId,
          enrollmentId: enrollmentByStudent.get(entry.studentId) ?? null,
          academicYearId: classRow.academic_year_id,
          termId: term,
          classId,
          subjectId,
          gradingSchemeId: scheme.id,
          score: entry.percentage,
          maxScore: 100,
          percentage: entry.percentage,
          letterGrade: entry.letterGrade,
          performance: entry.performance,
          gpaPoint: entry.gpaPoint,
          teacherComment: null,
          isFinal,
          recordedBy: context.userId,
        },
        client,
      );

      if (!existing || existing.score !== entry.percentage) {
        await repository.insertGradeHistory(
          {
            gradeId,
            oldScore: existing?.score ?? null,
            newScore: entry.percentage,
            oldLetter: existing?.letter_grade ?? null,
            newLetter: entry.letterGrade,
            reason: 'Calculated from assessment results',
            changedBy: context.userId,
          },
          client,
        );
      }
    }

    await repository.recalculateRanks(
      classId,
      subjectId,
      classRow.academic_year_id,
      term,
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'grade',
        entityId: classId,
        description: `Generated subject grades for ${classRow.name}`,
        newValue: { classId, subjectId, termId: term, students: calculated.length, isFinal },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  const rows = await repository.findAllGrades({
    classId,
    subjectId,
    academicYearId: classRow.academic_year_id,
    termId: term ?? undefined,
  });

  return rows.map(toDto);
};

/**
 * Saves a manually entered grade. Every change is appended to `grade_history`,
 * which is what makes a grade correction auditable.
 */
export const saveGrade = async (
  input: {
    studentId: number;
    classId: number;
    subjectId: number;
    termId?: number | null;
    score?: number | null;
    maxScore?: number;
    teacherComment?: string | null;
    isFinal?: boolean;
    reason?: string | null;
  },
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<GradeDto> => {
  await assertCanEnterGrades(user, input.classId, input.subjectId);

  const classRow = await classRepository.findClassById(input.classId);

  if (!classRow) {
    throw AppError.notFound('Class not found', 'CLASS_NOT_FOUND');
  }

  if (classRow.academic_year_status === 'CLOSED') {
    throw AppError.conflict('The academic year of this class is closed', 'ACADEMIC_YEAR_CLOSED');
  }

  const maxScore = input.maxScore ?? 100;

  if (input.score !== null && input.score !== undefined) {
    if (input.score < 0 || input.score > maxScore) {
      throw AppError.validation('Validation failed', [
        { field: 'score', message: `Score must be between 0 and ${maxScore}` },
      ]);
    }
  }

  // A single saved mark belongs to a term for the same reason a generated one
  // does; without this the manual entry screen produced the same orphan rows.
  const termId = await resolveTermId(classRow.academic_year_id, input.termId ?? null);
  const { scheme, scales } = await loadScheme();
  const percentage =
    input.score === null || input.score === undefined
      ? null
      : Number(((input.score / maxScore) * 100).toFixed(2));
  const scaled = applyScale(percentage, scales);

  const enrollment = await enrollmentRepository.findActiveEnrollment(
    input.studentId,
    classRow.academic_year_id,
  );

  const gradeId = await withTransaction(async (client) => {
    const existing = await repository.findGrade(
      input.studentId,
      classRow.academic_year_id,
      termId,
      input.subjectId,
      client,
    );

    const id = await repository.upsertGrade(
      {
        studentId: input.studentId,
        enrollmentId: enrollment?.id ?? null,
        academicYearId: classRow.academic_year_id,
        termId,
        classId: input.classId,
        subjectId: input.subjectId,
        gradingSchemeId: scheme.id,
        score: input.score ?? null,
        maxScore,
        percentage,
        letterGrade: scaled.letterGrade,
        performance: scaled.performance,
        gpaPoint: scaled.gpaPoint,
        teacherComment: input.teacherComment ?? null,
        isFinal: input.isFinal ?? false,
        recordedBy: context.userId,
      },
      client,
    );

    await repository.insertGradeHistory(
      {
        gradeId: id,
        oldScore: existing?.score ?? null,
        newScore: input.score ?? null,
        oldLetter: existing?.letter_grade ?? null,
        newLetter: scaled.letterGrade,
        reason: input.reason ?? 'Manual grade entry',
        changedBy: context.userId,
      },
      client,
    );

    await repository.recalculateRanks(
      input.classId,
      input.subjectId,
      classRow.academic_year_id,
      termId,
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'grade',
        entityId: id,
        description: `Recorded a grade for student ${input.studentId}`,
        oldValue: { score: existing?.score ?? null, letterGrade: existing?.letter_grade ?? null },
        newValue: { score: input.score ?? null, letterGrade: scaled.letterGrade },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return id;
  });

  return getById(gradeId);
};

export const saveManyGrades = async (
  entries: {
    studentId: number;
    classId: number;
    subjectId: number;
    termId?: number | null;
    score?: number | null;
    maxScore?: number;
    teacherComment?: string | null;
    isFinal?: boolean;
    reason?: string | null;
  }[],
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<GradeDto[]> => {
  const saved: GradeDto[] = [];

  for (const entry of entries) {
    saved.push(await saveGrade(entry, user, context));
  }

  return saved;
};

export const history = async (gradeId: number): Promise<GradeHistoryEntry[]> => {
  await getById(gradeId);
  return repository.findGradeHistory(gradeId);
};

// ---------------------------------------------------------------------------
// Grading schemes
// ---------------------------------------------------------------------------

export const listSchemes = async (): Promise<GradingSchemeDto[]> => {
  const schemes = await repository.findGradingSchemes();

  return Promise.all(
    schemes.map(async (scheme) => {
      const [components, scales] = await Promise.all([
        repository.findComponents(scheme.id),
        repository.findScales(scheme.id),
      ]);

      return {
        id: scheme.id,
        code: scheme.code,
        name: scheme.name,
        description: scheme.description,
        isDefault: scheme.is_default,
        isActive: scheme.is_active,
        components: components.map((component) => ({
          assessmentType: component.assessment_type,
          weightPercent: Number(component.weight_percent),
        })),
        scales: scales.map((scale) => ({
          letterGrade: scale.letter_grade,
          minScore: Number(scale.min_score),
          maxScore: Number(scale.max_score),
          gpaPoint: scale.gpa_point === null ? null : Number(scale.gpa_point),
          performance: scale.performance,
          remark: scale.remark_en,
        })),
      };
    }),
  );
};

export const updateScheme = async (
  id: number,
  input: {
    components?: { assessmentType: string; weightPercent: number }[];
    scales?: {
      letterGrade: string;
      minScore: number;
      maxScore: number;
      gpaPoint?: number | null;
      performance: string;
      remarkEn?: string | null;
    }[];
  },
  context: AuditContext,
): Promise<GradingSchemeDto> => {
  const scheme = await repository.findGradingSchemeById(id);

  if (!scheme) {
    throw AppError.notFound('Grading scheme not found', 'GRADING_SCHEME_NOT_FOUND');
  }

  if (input.components) {
    const total = input.components.reduce((sum, component) => sum + component.weightPercent, 0);

    if (Math.abs(total - 100) > 0.01) {
      throw AppError.validation('Validation failed', [
        { field: 'components', message: `Component weights must total 100% (currently ${total}%)` },
      ]);
    }
  }

  await withTransaction(async (client) => {
    if (input.components) {
      await repository.replaceComponents(id, input.components, client);
    }

    if (input.scales) {
      await repository.replaceScales(id, input.scales, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'grading_scheme',
        entityId: id,
        description: `Updated grading scheme ${scheme.name}`,
        newValue: input as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  const schemes = await listSchemes();
  return schemes.find((item) => item.id === id) as GradingSchemeDto;
};

export const classSubjectAverages = async (
  classId: number,
  academicYearId: number,
  termId: number | null,
) => repository.classSubjectAverages(classId, academicYearId, termId);

export const classAverages = async (academicYearId: number, termId: number | null) =>
  repository.classAverages(academicYearId, termId);
