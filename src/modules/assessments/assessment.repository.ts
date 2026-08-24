import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams, SortParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  AssessmentFilters,
  AssessmentResultRow,
  AssessmentRow,
  AssessmentStatistics,
  CreateAssessmentInput,
  UpdateAssessmentInput,
} from './assessment.types';

export const ASSESSMENT_SORT_COLUMNS = [
  'assessment_date',
  'title',
  'type',
  'created_at',
] as const;
export type AssessmentSortColumn = (typeof ASSESSMENT_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<AssessmentSortColumn, string> = {
  assessment_date: 'a.assessment_date',
  title: 'a.title',
  type: 'a.type',
  created_at: 'a.created_at',
};

const BASE_SELECT = `
  SELECT a.*,
         c.name AS class_name,
         s.name_en AS subject_name,
         NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), '') AS teacher_name,
         term.name AS term_name,
         y.name AS academic_year_name,
         y.status::text AS academic_year_status,
         (SELECT COUNT(*)::int FROM assessment_results r
           WHERE r.assessment_id = a.id AND (r.score IS NOT NULL OR r.is_absent)) AS graded_count,
         (SELECT COUNT(*)::int FROM enrollments e
           WHERE e.class_id = a.class_id AND e.status = 'ACTIVE') AS student_count,
         (SELECT ROUND(AVG(r2.score)::numeric, 2) FROM assessment_results r2
           WHERE r2.assessment_id = a.id AND r2.score IS NOT NULL) AS average_score
    FROM assessments a
    JOIN classes c ON c.id = a.class_id
    JOIN subjects s ON s.id = a.subject_id
    JOIN academic_years y ON y.id = a.academic_year_id
    LEFT JOIN teachers t ON t.id = a.teacher_id
    LEFT JOIN academic_terms term ON term.id = a.term_id
`;

const buildConditions = (filters: AssessmentFilters, builder: ParamBuilder): string[] => {
  const conditions = ['a.deleted_at IS NULL'];

  if (filters.academicYearId !== undefined) {
    conditions.push(`a.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.termId !== undefined) {
    conditions.push(`a.term_id = ${builder.add(filters.termId)}`);
  }

  if (filters.classId !== undefined) {
    conditions.push(`a.class_id = ${builder.add(filters.classId)}`);
  }

  if (filters.subjectId !== undefined) {
    conditions.push(`a.subject_id = ${builder.add(filters.subjectId)}`);
  }

  if (filters.teacherId !== undefined) {
    conditions.push(`a.teacher_id = ${builder.add(filters.teacherId)}`);
  }

  if (filters.type) {
    conditions.push(`a.type = ${builder.add(filters.type)}::assessment_type`);
  }

  if (filters.isPublished !== undefined) {
    conditions.push(`a.is_published = ${builder.add(filters.isPublished)}`);
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(`(a.title ILIKE ${pattern} OR s.name_en ILIKE ${pattern} OR c.name ILIKE ${pattern})`);
  }

  return conditions;
};

export const findAssessments = async (
  filters: AssessmentFilters,
  pagination: PaginationParams,
  sort: SortParams<AssessmentSortColumn>,
): Promise<PaginatedResult<AssessmentRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM assessments a
       JOIN classes c ON c.id = a.class_id
       JOIN subjects s ON s.id = a.subject_id
       ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<AssessmentRow>(
    `${BASE_SELECT}
     ${where}
     ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder} NULLS LAST, a.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAssessmentById = async (
  id: number,
  executor: Queryable = pool,
): Promise<AssessmentRow | null> => {
  const result = await executor.query<AssessmentRow>(
    `${BASE_SELECT} WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const insertAssessment = async (
  input: CreateAssessmentInput & {
    academicYearId: number;
    classSubjectId: number | null;
    createdBy: number | null;
  },
  executor: Queryable = pool,
): Promise<AssessmentRow> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO assessments (
        academic_year_id, term_id, class_id, subject_id, class_subject_id, teacher_id,
        title, description, type, max_score, weight_percent, assessment_date, is_published, created_by
     ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9::assessment_type, $10, $11, $12::date, COALESCE($13, FALSE), $14
     )
     RETURNING id`,
    [
      input.academicYearId,
      input.termId ?? null,
      input.classId,
      input.subjectId,
      input.classSubjectId,
      input.teacherId ?? null,
      input.title,
      input.description ?? null,
      input.type,
      input.maxScore,
      input.weightPercent ?? null,
      input.assessmentDate ?? null,
      input.isPublished ?? null,
      input.createdBy,
    ],
  );

  return (await findAssessmentById(result.rows[0].id, executor)) as AssessmentRow;
};

export const updateAssessment = async (
  id: number,
  input: UpdateAssessmentInput,
  executor: Queryable = pool,
): Promise<AssessmentRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    termId: { column: 'term_id' },
    teacherId: { column: 'teacher_id' },
    title: { column: 'title' },
    description: { column: 'description' },
    type: { column: 'type', cast: 'assessment_type' },
    maxScore: { column: 'max_score' },
    weightPercent: { column: 'weight_percent' },
    assessmentDate: { column: 'assessment_date', cast: 'date' },
    isPublished: { column: 'is_published' },
  });

  if (assignments.length === 0) {
    return findAssessmentById(id, executor);
  }

  params.push(id);

  await executor.query(
    `UPDATE assessments SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL`,
    params,
  );

  return findAssessmentById(id, executor);
};

export const softDeleteAssessment = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE assessments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Every actively enrolled student of the class, left-joined onto whatever result
 * has been entered. This is the score entry sheet.
 */
export const findResultSheet = async (
  assessmentId: number,
  classId: number,
  executor: Queryable = pool,
): Promise<AssessmentResultRow[]> => {
  const result = await executor.query<AssessmentResultRow>(
    `SELECT r.id,
            $1::bigint AS assessment_id,
            s.id AS student_id,
            e.id AS enrollment_id,
            r.score,
            COALESCE(r.is_absent, FALSE) AS is_absent,
            r.feedback,
            r.graded_by,
            r.graded_at,
            s.student_code,
            s.first_name_en, s.last_name_en, s.first_name_kh, s.last_name_kh,
            s.profile_photo,
            e.roll_number
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN assessment_results r ON r.assessment_id = $1 AND r.student_id = s.id
      WHERE e.class_id = $2 AND e.status = 'ACTIVE' AND s.deleted_at IS NULL
      ORDER BY COALESCE(NULLIF(e.roll_number, '')::text, '999999'), s.first_name_en ASC`,
    [assessmentId, classId],
  );

  return result.rows;
};

export const upsertResult = async (
  input: {
    assessmentId: number;
    studentId: number;
    enrollmentId: number | null;
    score: number | null;
    isAbsent: boolean;
    feedback: string | null;
    gradedBy: number | null;
  },
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `INSERT INTO assessment_results
        (assessment_id, student_id, enrollment_id, score, is_absent, feedback, graded_by, graded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (assessment_id, student_id) DO UPDATE
       SET score = EXCLUDED.score,
           is_absent = EXCLUDED.is_absent,
           feedback = EXCLUDED.feedback,
           graded_by = EXCLUDED.graded_by,
           graded_at = NOW()`,
    [
      input.assessmentId,
      input.studentId,
      input.enrollmentId,
      input.score,
      input.isAbsent,
      input.feedback,
      input.gradedBy,
    ],
  );
};

export const findResultsByStudent = async (
  studentId: number,
  filters: { academicYearId?: number; termId?: number; subjectId?: number; classId?: number },
  executor: Queryable = pool,
): Promise<(AssessmentResultRow & { assessment: AssessmentRow })[]> => {
  const builder = new ParamBuilder();
  const conditions = [
    `r.student_id = ${builder.add(studentId)}`,
    'a.deleted_at IS NULL',
    'a.is_published',
  ];

  if (filters.academicYearId !== undefined) {
    conditions.push(`a.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.termId !== undefined) {
    conditions.push(`a.term_id = ${builder.add(filters.termId)}`);
  }

  if (filters.subjectId !== undefined) {
    conditions.push(`a.subject_id = ${builder.add(filters.subjectId)}`);
  }

  if (filters.classId !== undefined) {
    conditions.push(`a.class_id = ${builder.add(filters.classId)}`);
  }

  const result = await executor.query(
    `SELECT r.*, ROW_TO_JSON(a.*) AS assessment
       FROM assessment_results r
       JOIN assessments a ON a.id = r.assessment_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.assessment_date DESC NULLS LAST, a.id DESC`,
    builder.params,
  );

  return result.rows as (AssessmentResultRow & { assessment: AssessmentRow })[];
};

export const computeStatistics = async (
  assessmentId: number,
  passMarkPercent = 50,
  executor: Queryable = pool,
): Promise<AssessmentStatistics> => {
  const result = await executor.query<AssessmentStatistics>(
    `SELECT a.id AS "assessmentId",
            a.max_score AS "maxScore",
            COUNT(r.id) FILTER (WHERE r.score IS NOT NULL)::int AS "gradedCount",
            (SELECT COUNT(*)::int FROM enrollments e
              WHERE e.class_id = a.class_id AND e.status = 'ACTIVE') AS "studentCount",
            ROUND(AVG(r.score) FILTER (WHERE r.score IS NOT NULL)::numeric, 2) AS "averageScore",
            ROUND((AVG(r.score) FILTER (WHERE r.score IS NOT NULL) / NULLIF(a.max_score, 0) * 100)::numeric, 2) AS "averagePercent",
            MAX(r.score) AS "highestScore",
            MIN(r.score) AS "lowestScore",
            COUNT(r.id) FILTER (WHERE r.score IS NOT NULL AND r.score >= a.max_score * $2 / 100)::int AS "passCount",
            COUNT(r.id) FILTER (WHERE r.score IS NOT NULL AND r.score < a.max_score * $2 / 100)::int AS "failCount",
            COUNT(r.id) FILTER (WHERE r.is_absent)::int AS "absentCount"
       FROM assessments a
       LEFT JOIN assessment_results r ON r.assessment_id = a.id
      WHERE a.id = $1
      GROUP BY a.id, a.max_score, a.class_id`,
    [assessmentId, passMarkPercent],
  );

  return (
    result.rows[0] ?? {
      assessmentId,
      maxScore: 0,
      gradedCount: 0,
      studentCount: 0,
      averageScore: null,
      averagePercent: null,
      highestScore: null,
      lowestScore: null,
      passCount: 0,
      failCount: 0,
      absentCount: 0,
    }
  );
};

/** Assessments a teacher has created but not finished grading. */
export const findPendingGrading = async (
  teacherId: number,
  academicYearId: number,
): Promise<AssessmentRow[]> => {
  const result = await pool.query<AssessmentRow>(
    `${BASE_SELECT}
      WHERE a.deleted_at IS NULL
        AND a.teacher_id = $1
        AND a.academic_year_id = $2
        AND (SELECT COUNT(*) FROM assessment_results r
              WHERE r.assessment_id = a.id AND (r.score IS NOT NULL OR r.is_absent))
            < (SELECT COUNT(*) FROM enrollments e
                WHERE e.class_id = a.class_id AND e.status = 'ACTIVE')
      ORDER BY a.assessment_date DESC NULLS LAST
      LIMIT 20`,
    [teacherId, academicYearId],
  );

  return result.rows;
};

/** Weighted component scores for one student and subject, used by grade calculation. */
export const aggregateForGrade = async (
  studentId: number,
  classId: number,
  subjectId: number,
  termId: number | null,
  executor: Queryable = pool,
): Promise<{ type: string; earned: number; possible: number }[]> => {
  const result = await executor.query<{ type: string; earned: number; possible: number }>(
    `SELECT a.type::text AS type,
            COALESCE(SUM(r.score), 0)::float AS earned,
            COALESCE(SUM(a.max_score) FILTER (WHERE r.score IS NOT NULL OR r.is_absent), 0)::float AS possible
       FROM assessments a
       LEFT JOIN assessment_results r ON r.assessment_id = a.id AND r.student_id = $1
      WHERE a.class_id = $2
        AND a.subject_id = $3
        AND a.deleted_at IS NULL
        AND (($4::bigint IS NULL) OR a.term_id = $4::bigint)
      GROUP BY a.type`,
    [studentId, classId, subjectId, termId],
  );

  return result.rows;
};

/**
 * How many assessments a class subject has for a term, and how many carry at
 * least one mark. Grading reads this before it writes anything: a term with no
 * assessment has nothing to calculate, and saying so is far more useful than
 * storing a row of empty grades.
 */
export const countForGrading = async (
  classId: number,
  subjectId: number,
  termId: number | null,
  executor: Queryable = pool,
): Promise<{ assessments: number; marked: number }> => {
  const result = await executor.query<{ assessments: number; marked: number }>(
    `SELECT COUNT(*)::int AS assessments,
            COUNT(*) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM assessment_results r
                 WHERE r.assessment_id = a.id AND (r.score IS NOT NULL OR r.is_absent)
              )
            )::int AS marked
       FROM assessments a
      WHERE a.class_id = $1
        AND a.subject_id = $2
        AND a.deleted_at IS NULL
        AND (($3::bigint IS NULL) OR a.term_id = $3::bigint)`,
    [classId, subjectId, termId],
  );

  return result.rows[0] ?? { assessments: 0, marked: 0 };
};
