import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams } from '../../types';
import { ParamBuilder } from '../../utils/sql';
import type {
  ReportCardFilters,
  ReportCardRow,
  ReportCardSubjectRow,
} from './report-card.types';

const BASE_SELECT = `
  SELECT rc.*,
         s.student_code,
         s.first_name_en AS student_first_name,
         s.last_name_en AS student_last_name,
         s.first_name_kh AS student_first_name_kh,
         s.last_name_kh AS student_last_name_kh,
         s.profile_photo AS student_photo,
         s.date_of_birth,
         c.name AS class_name,
         g.name_en AS grade_level_name,
         NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), '') AS homeroom_teacher_name,
         y.name AS academic_year_name,
         term.name AS term_name
    FROM report_cards rc
    JOIN students s ON s.id = rc.student_id
    JOIN classes c ON c.id = rc.class_id
    JOIN grade_levels g ON g.id = c.grade_level_id
    JOIN academic_years y ON y.id = rc.academic_year_id
    LEFT JOIN teachers t ON t.id = c.homeroom_teacher_id
    LEFT JOIN academic_terms term ON term.id = rc.term_id
`;

const buildConditions = (filters: ReportCardFilters, builder: ParamBuilder): string[] => {
  const conditions = ['s.deleted_at IS NULL'];

  if (filters.academicYearId !== undefined) {
    conditions.push(`rc.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.termId !== undefined) {
    conditions.push(`rc.term_id = ${builder.add(filters.termId)}`);
  }

  if (filters.classId !== undefined) {
    conditions.push(`rc.class_id = ${builder.add(filters.classId)}`);
  }

  if (filters.studentId !== undefined) {
    conditions.push(`rc.student_id = ${builder.add(filters.studentId)}`);
  }

  if (filters.status) {
    conditions.push(`rc.status = ${builder.add(filters.status)}::report_card_status`);
  }

  return conditions;
};

export const findReportCards = async (
  filters: ReportCardFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<ReportCardRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM report_cards rc
       JOIN students s ON s.id = rc.student_id
       ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<ReportCardRow>(
    `${BASE_SELECT}
     ${where}
     ORDER BY rc.rank_in_class ASC NULLS LAST, s.first_name_en ASC
     LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findReportCardById = async (
  id: number,
  executor: Queryable = pool,
): Promise<ReportCardRow | null> => {
  const result = await executor.query<ReportCardRow>(`${BASE_SELECT} WHERE rc.id = $1`, [id]);
  return result.rows[0] ?? null;
};

export const findReportCard = async (
  studentId: number,
  academicYearId: number,
  termId: number | null,
  executor: Queryable = pool,
): Promise<ReportCardRow | null> => {
  const result = await executor.query<ReportCardRow>(
    `${BASE_SELECT}
      WHERE rc.student_id = $1
        AND rc.academic_year_id = $2
        AND COALESCE(rc.term_id, 0) = COALESCE($3::bigint, 0)`,
    [studentId, academicYearId, termId],
  );

  return result.rows[0] ?? null;
};

export const upsertReportCard = async (
  input: {
    studentId: number;
    enrollmentId: number | null;
    academicYearId: number;
    termId: number | null;
    classId: number;
    totalScore: number | null;
    averageScore: number | null;
    gpa: number | null;
    letterGrade: string | null;
    performance: string | null;
    classSize: number;
    daysPresent: number;
    daysAbsent: number;
    daysLate: number;
    daysExcused: number;
    attendancePercent: number | null;
    status: string;
    generatedBy: number | null;
  },
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO report_cards (
        student_id, enrollment_id, academic_year_id, term_id, class_id,
        total_score, average_score, gpa, letter_grade, performance,
        class_size, days_present, days_absent, days_late, days_excused, attendance_percent,
        status, generated_by, generated_at
     ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10::performance_level,
        $11, $12, $13, $14, $15, $16,
        $17::report_card_status, $18, NOW()
     )
     ON CONFLICT (student_id, academic_year_id, COALESCE(term_id, 0)) DO UPDATE
       SET class_id = EXCLUDED.class_id,
           enrollment_id = EXCLUDED.enrollment_id,
           total_score = EXCLUDED.total_score,
           average_score = EXCLUDED.average_score,
           gpa = EXCLUDED.gpa,
           letter_grade = EXCLUDED.letter_grade,
           performance = EXCLUDED.performance,
           class_size = EXCLUDED.class_size,
           days_present = EXCLUDED.days_present,
           days_absent = EXCLUDED.days_absent,
           days_late = EXCLUDED.days_late,
           days_excused = EXCLUDED.days_excused,
           attendance_percent = EXCLUDED.attendance_percent,
           status = EXCLUDED.status,
           generated_by = EXCLUDED.generated_by,
           generated_at = NOW()
     RETURNING id`,
    [
      input.studentId,
      input.enrollmentId,
      input.academicYearId,
      input.termId,
      input.classId,
      input.totalScore,
      input.averageScore,
      input.gpa,
      input.letterGrade,
      input.performance,
      input.classSize,
      input.daysPresent,
      input.daysAbsent,
      input.daysLate,
      input.daysExcused,
      input.attendancePercent,
      input.status,
      input.generatedBy,
    ],
  );

  return result.rows[0].id;
};

export const replaceSubjects = async (
  reportCardId: number,
  subjects: {
    subjectId: number;
    gradeId: number | null;
    score: number | null;
    maxScore: number;
    percentage: number | null;
    letterGrade: string | null;
    performance: string | null;
    rankInClass: number | null;
    displayOrder: number;
  }[],
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('DELETE FROM report_card_subjects WHERE report_card_id = $1', [
    reportCardId,
  ]);

  for (const subject of subjects) {
    await executor.query(
      `INSERT INTO report_card_subjects (
          report_card_id, subject_id, grade_id, score, max_score, percentage,
          letter_grade, performance, rank_in_class, display_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::performance_level, $9, $10)`,
      [
        reportCardId,
        subject.subjectId,
        subject.gradeId,
        subject.score,
        subject.maxScore,
        subject.percentage,
        subject.letterGrade,
        subject.performance,
        subject.rankInClass,
        subject.displayOrder,
      ],
    );
  }
};

export const findSubjects = async (
  reportCardId: number,
  executor: Queryable = pool,
): Promise<ReportCardSubjectRow[]> => {
  const result = await executor.query<ReportCardSubjectRow>(
    `SELECT rcs.*, s.name_en AS subject_name, s.name_kh AS subject_name_kh, s.code AS subject_code
       FROM report_card_subjects rcs
       JOIN subjects s ON s.id = rcs.subject_id
      WHERE rcs.report_card_id = $1
      ORDER BY rcs.display_order ASC, s.name_en ASC`,
    [reportCardId],
  );

  return result.rows;
};

export const updateComments = async (
  id: number,
  input: {
    teacherComment?: string | null;
    homeroomComment?: string | null;
    principalComment?: string | null;
  },
  executor: Queryable = pool,
): Promise<void> => {
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (input.teacherComment !== undefined) {
    params.push(input.teacherComment);
    assignments.push(`teacher_comment = $${params.length}`);
  }

  if (input.homeroomComment !== undefined) {
    params.push(input.homeroomComment);
    assignments.push(`homeroom_comment = $${params.length}`);
  }

  if (input.principalComment !== undefined) {
    params.push(input.principalComment);
    assignments.push(`principal_comment = $${params.length}`);
  }

  if (assignments.length === 0) {
    return;
  }

  params.push(id);

  await executor.query(
    `UPDATE report_cards SET ${assignments.join(', ')} WHERE id = $${params.length}`,
    params,
  );
};

export const updateSubjectComment = async (
  reportCardId: number,
  subjectId: number,
  comment: string | null,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    'UPDATE report_card_subjects SET comment = $3 WHERE report_card_id = $1 AND subject_id = $2',
    [reportCardId, subjectId, comment],
  );
};

export const setStatus = async (
  id: number,
  status: string,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `UPDATE report_cards
        SET status = $2::report_card_status,
            published_at = CASE WHEN $2 = 'PUBLISHED' THEN NOW() ELSE published_at END
      WHERE id = $1`,
    [id, status],
  );
};

/** Recomputes the overall class rank from the stored averages. */
export const recalculateRanks = async (
  classId: number,
  academicYearId: number,
  termId: number | null,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `UPDATE report_cards rc
        SET rank_in_class = ranked.position
       FROM (
         SELECT id, RANK() OVER (ORDER BY average_score DESC NULLS LAST) AS position
           FROM report_cards
          WHERE class_id = $1
            AND academic_year_id = $2
            AND COALESCE(term_id, 0) = COALESCE($3::bigint, 0)
       ) AS ranked
      WHERE rc.id = ranked.id`,
    [classId, academicYearId, termId],
  );
};
