import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  CreateExamInput,
  ExamFilters,
  ExamResultRow,
  ExamRow,
  UpdateExamInput,
} from './exam.types';

const BASE_SELECT = `
  SELECT e.*,
         c.name AS class_name,
         s.name_en AS subject_name,
         r.name AS room_name,
         term.name AS term_name,
         y.name AS academic_year_name,
         y.status::text AS academic_year_status,
         (SELECT COUNT(*)::int FROM exam_results er
           WHERE er.exam_id = e.id AND (er.score IS NOT NULL OR er.is_absent)) AS graded_count,
         (SELECT COUNT(*)::int FROM enrollments en
           WHERE en.class_id = e.class_id AND en.status = 'ACTIVE') AS student_count,
         (SELECT ROUND(AVG(er2.score)::numeric, 2) FROM exam_results er2
           WHERE er2.exam_id = e.id AND er2.score IS NOT NULL) AS average_score
    FROM exams e
    JOIN classes c ON c.id = e.class_id
    JOIN subjects s ON s.id = e.subject_id
    JOIN academic_years y ON y.id = e.academic_year_id
    LEFT JOIN rooms r ON r.id = e.room_id
    LEFT JOIN academic_terms term ON term.id = e.term_id
`;

const buildConditions = (filters: ExamFilters, builder: ParamBuilder): string[] => {
  const conditions = ['e.deleted_at IS NULL'];

  if (filters.academicYearId !== undefined) {
    conditions.push(`e.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.termId !== undefined) {
    conditions.push(`e.term_id = ${builder.add(filters.termId)}`);
  }

  if (filters.classId !== undefined) {
    conditions.push(`e.class_id = ${builder.add(filters.classId)}`);
  }

  if (filters.subjectId !== undefined) {
    conditions.push(`e.subject_id = ${builder.add(filters.subjectId)}`);
  }

  if (filters.type) {
    conditions.push(`e.type = ${builder.add(filters.type)}::exam_type`);
  }

  if (filters.dateFrom) {
    conditions.push(`e.exam_date >= ${builder.add(filters.dateFrom)}::date`);
  }

  if (filters.dateTo) {
    conditions.push(`e.exam_date <= ${builder.add(filters.dateTo)}::date`);
  }

  if (filters.upcomingOnly) {
    conditions.push('e.exam_date >= CURRENT_DATE');
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(`(e.title ILIKE ${pattern} OR s.name_en ILIKE ${pattern} OR c.name ILIKE ${pattern})`);
  }

  return conditions;
};

export const findExams = async (
  filters: ExamFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<ExamRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM exams e
       JOIN classes c ON c.id = e.class_id
       JOIN subjects s ON s.id = e.subject_id
       ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<ExamRow>(
    `${BASE_SELECT} ${where}
      ORDER BY e.exam_date ASC, e.start_time ASC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findUpcoming = async (
  academicYearId: number,
  limit = 10,
  classId?: number,
): Promise<ExamRow[]> => {
  const builder = new ParamBuilder();
  const conditions = [
    'e.deleted_at IS NULL',
    `e.academic_year_id = ${builder.add(academicYearId)}`,
    'e.exam_date >= CURRENT_DATE',
  ];

  if (classId !== undefined) {
    conditions.push(`e.class_id = ${builder.add(classId)}`);
  }

  const result = await pool.query<ExamRow>(
    `${BASE_SELECT}
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.exam_date ASC, e.start_time ASC NULLS LAST
      LIMIT ${builder.add(limit)}`,
    builder.params,
  );

  return result.rows;
};

export const findExamById = async (
  id: number,
  executor: Queryable = pool,
): Promise<ExamRow | null> => {
  const result = await executor.query<ExamRow>(
    `${BASE_SELECT} WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const insertExam = async (
  input: CreateExamInput & { academicYearId: number; createdBy: number | null },
  executor: Queryable = pool,
): Promise<ExamRow> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO exams (
        academic_year_id, term_id, class_id, subject_id, room_id,
        title, type, exam_date, start_time, duration_minutes, max_score, instructions, created_by
     ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7::exam_type, $8::date, $9::time, $10, $11, $12, $13
     )
     RETURNING id`,
    [
      input.academicYearId,
      input.termId ?? null,
      input.classId,
      input.subjectId,
      input.roomId ?? null,
      input.title,
      input.type,
      input.examDate,
      input.startTime ?? null,
      input.durationMinutes ?? null,
      input.maxScore,
      input.instructions ?? null,
      input.createdBy,
    ],
  );

  return (await findExamById(result.rows[0].id, executor)) as ExamRow;
};

export const updateExam = async (
  id: number,
  input: UpdateExamInput,
  executor: Queryable = pool,
): Promise<ExamRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    termId: { column: 'term_id' },
    roomId: { column: 'room_id' },
    title: { column: 'title' },
    type: { column: 'type', cast: 'exam_type' },
    examDate: { column: 'exam_date', cast: 'date' },
    startTime: { column: 'start_time', cast: 'time' },
    durationMinutes: { column: 'duration_minutes' },
    maxScore: { column: 'max_score' },
    instructions: { column: 'instructions' },
  });

  if (assignments.length === 0) {
    return findExamById(id, executor);
  }

  params.push(id);

  await executor.query(
    `UPDATE exams SET ${assignments.join(', ')} WHERE id = $${params.length} AND deleted_at IS NULL`,
    params,
  );

  return findExamById(id, executor);
};

export const softDeleteExam = async (id: number, executor: Queryable = pool): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE exams SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

export const findResultSheet = async (
  examId: number,
  classId: number,
  executor: Queryable = pool,
): Promise<ExamResultRow[]> => {
  const result = await executor.query<ExamResultRow>(
    `SELECT er.id,
            $1::bigint AS exam_id,
            s.id AS student_id,
            er.score,
            COALESCE(er.is_absent, FALSE) AS is_absent,
            er.remark,
            er.graded_at,
            s.student_code,
            s.first_name_en,
            s.last_name_en,
            e.roll_number
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN exam_results er ON er.exam_id = $1 AND er.student_id = s.id
      WHERE e.class_id = $2 AND e.status = 'ACTIVE' AND s.deleted_at IS NULL
      ORDER BY COALESCE(NULLIF(e.roll_number, '')::text, '999999'), s.first_name_en ASC`,
    [examId, classId],
  );

  return result.rows;
};

export const upsertExamResult = async (
  input: {
    examId: number;
    studentId: number;
    score: number | null;
    isAbsent: boolean;
    remark: string | null;
    gradedBy: number | null;
  },
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `INSERT INTO exam_results (exam_id, student_id, score, is_absent, remark, graded_by, graded_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (exam_id, student_id) DO UPDATE
       SET score = EXCLUDED.score,
           is_absent = EXCLUDED.is_absent,
           remark = EXCLUDED.remark,
           graded_by = EXCLUDED.graded_by,
           graded_at = NOW()`,
    [input.examId, input.studentId, input.score, input.isAbsent, input.remark, input.gradedBy],
  );
};
