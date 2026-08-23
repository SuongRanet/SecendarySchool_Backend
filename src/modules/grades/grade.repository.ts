import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams } from '../../types';
import { ParamBuilder } from '../../utils/sql';
import type {
  GradeFilters,
  GradeHistoryEntry,
  GradeRow,
  GradeScaleRow,
  GradingComponentRow,
  GradingSchemeRow,
} from './grade.types';

const BASE_SELECT = `
  SELECT g.*,
         s.student_code,
         s.first_name_en AS student_first_name,
         s.last_name_en AS student_last_name,
         sub.name_en AS subject_name,
         c.name AS class_name,
         term.name AS term_name,
         y.name AS academic_year_name,
         y.status::text AS academic_year_status
    FROM grades g
    JOIN students s ON s.id = g.student_id
    JOIN subjects sub ON sub.id = g.subject_id
    JOIN classes c ON c.id = g.class_id
    JOIN academic_years y ON y.id = g.academic_year_id
    LEFT JOIN academic_terms term ON term.id = g.term_id
`;

const buildConditions = (filters: GradeFilters, builder: ParamBuilder): string[] => {
  const conditions = ['s.deleted_at IS NULL'];

  if (filters.academicYearId !== undefined) {
    conditions.push(`g.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.termId !== undefined) {
    conditions.push(`g.term_id = ${builder.add(filters.termId)}`);
  }

  if (filters.classId !== undefined) {
    conditions.push(`g.class_id = ${builder.add(filters.classId)}`);
  }

  if (filters.subjectId !== undefined) {
    conditions.push(`g.subject_id = ${builder.add(filters.subjectId)}`);
  }

  if (filters.studentId !== undefined) {
    conditions.push(`g.student_id = ${builder.add(filters.studentId)}`);
  }

  if (filters.isFinal !== undefined) {
    conditions.push(`g.is_final = ${builder.add(filters.isFinal)}`);
  }

  return conditions;
};

export const findGrades = async (
  filters: GradeFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<GradeRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM grades g
       JOIN students s ON s.id = g.student_id
       ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<GradeRow>(
    `${BASE_SELECT}
     ${where}
     ORDER BY s.first_name_en ASC, sub.name_en ASC
     LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAllGrades = async (filters: GradeFilters): Promise<GradeRow[]> => {
  const builder = new ParamBuilder();

  const result = await pool.query<GradeRow>(
    `${BASE_SELECT}
      WHERE ${buildConditions(filters, builder).join(' AND ')}
      ORDER BY sub.name_en ASC`,
    builder.params,
  );

  return result.rows;
};

export const findGradeById = async (
  id: number,
  executor: Queryable = pool,
): Promise<GradeRow | null> => {
  const result = await executor.query<GradeRow>(`${BASE_SELECT} WHERE g.id = $1`, [id]);
  return result.rows[0] ?? null;
};

export const findGrade = async (
  studentId: number,
  academicYearId: number,
  termId: number | null,
  subjectId: number,
  executor: Queryable = pool,
): Promise<GradeRow | null> => {
  const result = await executor.query<GradeRow>(
    `${BASE_SELECT}
      WHERE g.student_id = $1
        AND g.academic_year_id = $2
        AND COALESCE(g.term_id, 0) = COALESCE($3::bigint, 0)
        AND g.subject_id = $4`,
    [studentId, academicYearId, termId, subjectId],
  );

  return result.rows[0] ?? null;
};

export const upsertGrade = async (
  input: {
    studentId: number;
    enrollmentId: number | null;
    academicYearId: number;
    termId: number | null;
    classId: number;
    subjectId: number;
    gradingSchemeId: number | null;
    score: number | null;
    maxScore: number;
    percentage: number | null;
    letterGrade: string | null;
    performance: string | null;
    gpaPoint: number | null;
    teacherComment: string | null;
    isFinal: boolean;
    recordedBy: number | null;
  },
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO grades (
        student_id, enrollment_id, academic_year_id, term_id, class_id, subject_id,
        grading_scheme_id, score, max_score, percentage, letter_grade, performance,
        gpa_point, teacher_comment, is_final, calculated_at, recorded_by
     ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12::performance_level,
        $13, $14, $15, NOW(), $16
     )
     ON CONFLICT (student_id, academic_year_id, COALESCE(term_id, 0), subject_id) DO UPDATE
       SET class_id = EXCLUDED.class_id,
           enrollment_id = EXCLUDED.enrollment_id,
           grading_scheme_id = EXCLUDED.grading_scheme_id,
           score = EXCLUDED.score,
           max_score = EXCLUDED.max_score,
           percentage = EXCLUDED.percentage,
           letter_grade = EXCLUDED.letter_grade,
           performance = EXCLUDED.performance,
           gpa_point = EXCLUDED.gpa_point,
           teacher_comment = COALESCE(EXCLUDED.teacher_comment, grades.teacher_comment),
           is_final = EXCLUDED.is_final,
           calculated_at = NOW(),
           recorded_by = EXCLUDED.recorded_by
     RETURNING id`,
    [
      input.studentId,
      input.enrollmentId,
      input.academicYearId,
      input.termId,
      input.classId,
      input.subjectId,
      input.gradingSchemeId,
      input.score,
      input.maxScore,
      input.percentage,
      input.letterGrade,
      input.performance,
      input.gpaPoint,
      input.teacherComment,
      input.isFinal,
      input.recordedBy,
    ],
  );

  return result.rows[0].id;
};

export const insertGradeHistory = async (
  input: {
    gradeId: number;
    oldScore: number | null;
    newScore: number | null;
    oldLetter: string | null;
    newLetter: string | null;
    reason: string | null;
    changedBy: number | null;
  },
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `INSERT INTO grade_history (grade_id, old_score, new_score, old_letter, new_letter, reason, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.gradeId,
      input.oldScore,
      input.newScore,
      input.oldLetter,
      input.newLetter,
      input.reason,
      input.changedBy,
    ],
  );
};

export const findGradeHistory = async (gradeId: number): Promise<GradeHistoryEntry[]> => {
  const result = await pool.query<GradeHistoryEntry>(
    `SELECT h.id,
            h.grade_id AS "gradeId",
            h.old_score AS "oldScore",
            h.new_score AS "newScore",
            h.old_letter AS "oldLetter",
            h.new_letter AS "newLetter",
            h.reason,
            h.changed_by AS "changedBy",
            u.username AS "changedByName",
            h.created_at AS "createdAt"
       FROM grade_history h
       LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.grade_id = $1
      ORDER BY h.created_at DESC`,
    [gradeId],
  );

  return result.rows;
};

/** Recomputes the class rank for one subject, term and class. */
export const recalculateRanks = async (
  classId: number,
  subjectId: number,
  academicYearId: number,
  termId: number | null,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `UPDATE grades g
        SET rank_in_class = ranked.position
       FROM (
         SELECT id,
                RANK() OVER (ORDER BY percentage DESC NULLS LAST) AS position
           FROM grades
          WHERE class_id = $1
            AND subject_id = $2
            AND academic_year_id = $3
            AND COALESCE(term_id, 0) = COALESCE($4::bigint, 0)
       ) AS ranked
      WHERE g.id = ranked.id`,
    [classId, subjectId, academicYearId, termId],
  );
};

// ---------------------------------------------------------------------------
// Grading schemes
// ---------------------------------------------------------------------------

export const findGradingSchemes = async (): Promise<GradingSchemeRow[]> => {
  const result = await pool.query<GradingSchemeRow>(
    'SELECT id, code, name, description, is_default, is_active FROM grading_schemes ORDER BY is_default DESC, name ASC',
  );

  return result.rows;
};

export const findDefaultGradingScheme = async (
  executor: Queryable = pool,
): Promise<GradingSchemeRow | null> => {
  const result = await executor.query<GradingSchemeRow>(
    `SELECT id, code, name, description, is_default, is_active
       FROM grading_schemes
      WHERE is_default AND is_active
      LIMIT 1`,
  );

  return result.rows[0] ?? null;
};

export const findGradingSchemeById = async (
  id: number,
  executor: Queryable = pool,
): Promise<GradingSchemeRow | null> => {
  const result = await executor.query<GradingSchemeRow>(
    'SELECT id, code, name, description, is_default, is_active FROM grading_schemes WHERE id = $1',
    [id],
  );

  return result.rows[0] ?? null;
};

export const findComponents = async (
  gradingSchemeId: number,
  executor: Queryable = pool,
): Promise<GradingComponentRow[]> => {
  const result = await executor.query<GradingComponentRow>(
    `SELECT id, grading_scheme_id, assessment_type, weight_percent
       FROM grading_scheme_components
      WHERE grading_scheme_id = $1
      ORDER BY weight_percent DESC`,
    [gradingSchemeId],
  );

  return result.rows;
};

export const findScales = async (
  gradingSchemeId: number,
  executor: Queryable = pool,
): Promise<GradeScaleRow[]> => {
  const result = await executor.query<GradeScaleRow>(
    `SELECT id, grading_scheme_id, letter_grade, min_score, max_score, gpa_point,
            performance, remark_en, remark_kh
       FROM grade_scales
      WHERE grading_scheme_id = $1
      ORDER BY min_score DESC`,
    [gradingSchemeId],
  );

  return result.rows;
};

export const replaceComponents = async (
  gradingSchemeId: number,
  components: { assessmentType: string; weightPercent: number }[],
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('DELETE FROM grading_scheme_components WHERE grading_scheme_id = $1', [
    gradingSchemeId,
  ]);

  for (const component of components) {
    await executor.query(
      `INSERT INTO grading_scheme_components (grading_scheme_id, assessment_type, weight_percent)
       VALUES ($1, $2::assessment_type, $3)`,
      [gradingSchemeId, component.assessmentType, component.weightPercent],
    );
  }
};

export const replaceScales = async (
  gradingSchemeId: number,
  scales: {
    letterGrade: string;
    minScore: number;
    maxScore: number;
    gpaPoint?: number | null;
    performance: string;
    remarkEn?: string | null;
  }[],
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('DELETE FROM grade_scales WHERE grading_scheme_id = $1', [gradingSchemeId]);

  for (const scale of scales) {
    await executor.query(
      `INSERT INTO grade_scales
          (grading_scheme_id, letter_grade, min_score, max_score, gpa_point, performance, remark_en)
       VALUES ($1, $2, $3, $4, $5, $6::performance_level, $7)`,
      [
        gradingSchemeId,
        scale.letterGrade,
        scale.minScore,
        scale.maxScore,
        scale.gpaPoint ?? null,
        scale.performance,
        scale.remarkEn ?? null,
      ],
    );
  }
};

/** Per-subject averages for a class, used by class performance reporting. */
export const classSubjectAverages = async (
  classId: number,
  academicYearId: number,
  termId: number | null,
): Promise<{ subjectId: number; subjectName: string; average: number | null; count: number }[]> => {
  const result = await pool.query<{
    subjectId: number;
    subjectName: string;
    average: number | null;
    count: number;
  }>(
    `SELECT sub.id AS "subjectId",
            sub.name_en AS "subjectName",
            ROUND(AVG(g.percentage)::numeric, 2) AS average,
            COUNT(g.id)::int AS count
       FROM grades g
       JOIN subjects sub ON sub.id = g.subject_id
      WHERE g.class_id = $1
        AND g.academic_year_id = $2
        AND COALESCE(g.term_id, 0) = COALESCE($3::bigint, 0)
      GROUP BY sub.id, sub.name_en
      ORDER BY sub.name_en ASC`,
    [classId, academicYearId, termId],
  );

  return result.rows;
};

/** Overall averages per class, used by the principal dashboard. */
export const classAverages = async (
  academicYearId: number,
  termId: number | null,
): Promise<{ classId: number; className: string; average: number | null; studentCount: number }[]> => {
  const result = await pool.query<{
    classId: number;
    className: string;
    average: number | null;
    studentCount: number;
  }>(
    `SELECT c.id AS "classId",
            c.name AS "className",
            ROUND(AVG(g.percentage)::numeric, 2) AS average,
            COUNT(DISTINCT g.student_id)::int AS "studentCount"
       FROM classes c
       LEFT JOIN grades g ON g.class_id = c.id
                         AND COALESCE(g.term_id, 0) = COALESCE($2::bigint, 0)
       JOIN grade_levels gl ON gl.id = c.grade_level_id
      WHERE c.academic_year_id = $1 AND c.deleted_at IS NULL
      GROUP BY c.id, c.name, gl.level_order
      ORDER BY gl.level_order ASC, c.name ASC`,
    [academicYearId, termId],
  );

  return result.rows;
};
