import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  AssignmentFilters,
  AssignmentRow,
  CreateAssignmentInput,
  SubmissionRow,
  UpdateAssignmentInput,
} from './assignment.types';

const selectFor = (studentPlaceholder: string | null): string => `
  SELECT a.*,
         c.name AS class_name,
         s.name_en AS subject_name,
         NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), '') AS teacher_name,
         (SELECT COUNT(*)::int FROM submissions sub
           WHERE sub.assignment_id = a.id AND sub.status <> 'PENDING') AS submission_count,
         (SELECT COUNT(*)::int FROM enrollments e
           WHERE e.class_id = a.class_id AND e.status = 'ACTIVE') AS student_count,
         (SELECT COUNT(*)::int FROM submissions sub2
           WHERE sub2.assignment_id = a.id AND sub2.status = 'GRADED') AS graded_count
         ${
           studentPlaceholder
             ? `,
         (SELECT sub3.status FROM submissions sub3
           WHERE sub3.assignment_id = a.id AND sub3.student_id = ${studentPlaceholder}) AS submission_status,
         (SELECT sub4.score FROM submissions sub4
           WHERE sub4.assignment_id = a.id AND sub4.student_id = ${studentPlaceholder}) AS submission_score,
         (SELECT sub5.feedback FROM submissions sub5
           WHERE sub5.assignment_id = a.id AND sub5.student_id = ${studentPlaceholder}) AS submission_feedback`
             : ''
         }
    FROM assignments a
    JOIN classes c ON c.id = a.class_id
    JOIN subjects s ON s.id = a.subject_id
    LEFT JOIN teachers t ON t.id = a.teacher_id
`;

const buildConditions = (
  filters: AssignmentFilters,
  builder: ParamBuilder,
  studentPlaceholder: string | null,
): string[] => {
  const conditions = ['a.deleted_at IS NULL'];

  if (filters.academicYearId !== undefined) {
    conditions.push(`a.academic_year_id = ${builder.add(filters.academicYearId)}`);
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

  if (filters.status) {
    conditions.push(`a.status = ${builder.add(filters.status)}::assignment_status`);
  }

  if (filters.dueFrom) {
    conditions.push(`a.due_date >= ${builder.add(filters.dueFrom)}::date`);
  }

  if (filters.dueTo) {
    conditions.push(`a.due_date <= ${builder.add(filters.dueTo)}::date`);
  }

  // A student or guardian only ever sees published homework of the classes the
  // student is enrolled in.
  if (studentPlaceholder) {
    conditions.push(`a.status = 'PUBLISHED'`);
    conditions.push(
      `a.class_id IN (SELECT e2.class_id FROM enrollments e2
                       WHERE e2.student_id = ${studentPlaceholder} AND e2.status = 'ACTIVE')`,
    );

    if (filters.pendingOnly) {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM submissions sub6
                      WHERE sub6.assignment_id = a.id
                        AND sub6.student_id = ${studentPlaceholder}
                        AND sub6.status IN ('SUBMITTED', 'GRADED', 'LATE'))`,
      );
    }
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(`(a.title ILIKE ${pattern} OR s.name_en ILIKE ${pattern} OR c.name ILIKE ${pattern})`);
  }

  return conditions;
};

export const findAssignments = async (
  filters: AssignmentFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<AssignmentRow>> => {
  const builder = new ParamBuilder();
  const studentPlaceholder =
    filters.studentId !== undefined ? builder.add(filters.studentId) : null;
  const where = `WHERE ${buildConditions(filters, builder, studentPlaceholder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       JOIN subjects s ON s.id = a.subject_id
       ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<AssignmentRow>(
    `${selectFor(studentPlaceholder)} ${where}
      ORDER BY a.due_date ASC, a.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAssignmentById = async (
  id: number,
  executor: Queryable = pool,
): Promise<AssignmentRow | null> => {
  const result = await executor.query<AssignmentRow>(
    `${selectFor(null)} WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const insertAssignment = async (
  input: CreateAssignmentInput & { academicYearId: number; teacherId: number | null; createdBy: number | null },
  executor: Queryable = pool,
): Promise<AssignmentRow> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO assignments (
        academic_year_id, term_id, class_id, subject_id, teacher_id,
        title, description, instructions, attachment_url,
        assigned_date, due_date, max_score, status, published_at, created_by
     ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        COALESCE($10::date, CURRENT_DATE), $11::date, $12,
        CASE WHEN $13::boolean THEN 'PUBLISHED'::assignment_status ELSE 'DRAFT'::assignment_status END,
        CASE WHEN $13::boolean THEN NOW() ELSE NULL END,
        $14
     )
     RETURNING id`,
    [
      input.academicYearId,
      input.termId ?? null,
      input.classId,
      input.subjectId,
      input.teacherId,
      input.title,
      input.description ?? null,
      input.instructions ?? null,
      input.attachmentUrl ?? null,
      input.assignedDate ?? null,
      input.dueDate,
      input.maxScore ?? null,
      input.publishNow ?? false,
      input.createdBy,
    ],
  );

  return (await findAssignmentById(result.rows[0].id, executor)) as AssignmentRow;
};

export const updateAssignment = async (
  id: number,
  input: UpdateAssignmentInput,
  executor: Queryable = pool,
): Promise<AssignmentRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    termId: { column: 'term_id' },
    title: { column: 'title' },
    description: { column: 'description' },
    instructions: { column: 'instructions' },
    attachmentUrl: { column: 'attachment_url' },
    assignedDate: { column: 'assigned_date', cast: 'date' },
    dueDate: { column: 'due_date', cast: 'date' },
    maxScore: { column: 'max_score' },
  });

  if (assignments.length === 0) {
    return findAssignmentById(id, executor);
  }

  params.push(id);

  await executor.query(
    `UPDATE assignments SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL`,
    params,
  );

  return findAssignmentById(id, executor);
};

export const setStatus = async (
  id: number,
  status: string,
  executor: Queryable = pool,
): Promise<AssignmentRow | null> => {
  await executor.query(
    `UPDATE assignments
        SET status = $2::assignment_status,
            published_at = CASE WHEN $2 = 'PUBLISHED' THEN COALESCE(published_at, NOW()) ELSE published_at END
      WHERE id = $1`,
    [id, status],
  );

  return findAssignmentById(id, executor);
};

export const softDeleteAssignment = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE assignments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

/** Creates the PENDING submission rows so every student appears on the sheet. */
export const seedSubmissions = async (
  assignmentId: number,
  classId: number,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `INSERT INTO submissions (assignment_id, student_id, status)
     SELECT $1, e.student_id, 'PENDING'::submission_status
       FROM enrollments e
      WHERE e.class_id = $2 AND e.status = 'ACTIVE'
     ON CONFLICT (assignment_id, student_id) DO NOTHING`,
    [assignmentId, classId],
  );
};

export const findSubmissions = async (
  assignmentId: number,
  classId: number,
  executor: Queryable = pool,
): Promise<SubmissionRow[]> => {
  const result = await executor.query<SubmissionRow>(
    `SELECT sub.id,
            $1::bigint AS assignment_id,
            s.id AS student_id,
            COALESCE(sub.status, 'PENDING'::submission_status) AS status,
            sub.content,
            sub.attachment_url,
            sub.submitted_at,
            sub.score,
            sub.feedback,
            sub.graded_at,
            s.student_code,
            s.first_name_en,
            s.last_name_en,
            e.roll_number
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN submissions sub ON sub.assignment_id = $1 AND sub.student_id = s.id
      WHERE e.class_id = $2 AND e.status = 'ACTIVE' AND s.deleted_at IS NULL
      ORDER BY COALESCE(NULLIF(e.roll_number, '')::text, '999999'), s.first_name_en ASC`,
    [assignmentId, classId],
  );

  return result.rows;
};

export const gradeSubmission = async (
  input: {
    assignmentId: number;
    studentId: number;
    score: number | null;
    feedback: string | null;
    status: string;
    gradedBy: number | null;
  },
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `INSERT INTO submissions (assignment_id, student_id, status, score, feedback, graded_by, graded_at)
     VALUES ($1, $2, $3::submission_status, $4, $5, $6, NOW())
     ON CONFLICT (assignment_id, student_id) DO UPDATE
       SET status = EXCLUDED.status,
           score = EXCLUDED.score,
           feedback = EXCLUDED.feedback,
           graded_by = EXCLUDED.graded_by,
           graded_at = NOW()`,
    [
      input.assignmentId,
      input.studentId,
      input.status,
      input.score,
      input.feedback,
      input.gradedBy,
    ],
  );
};

export const recordSubmission = async (
  input: {
    assignmentId: number;
    studentId: number;
    content: string | null;
    attachmentUrl: string | null;
    isLate: boolean;
  },
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `INSERT INTO submissions (assignment_id, student_id, status, content, attachment_url, submitted_at)
     VALUES ($1, $2, $3::submission_status, $4, $5, NOW())
     ON CONFLICT (assignment_id, student_id) DO UPDATE
       SET status = EXCLUDED.status,
           content = EXCLUDED.content,
           attachment_url = EXCLUDED.attachment_url,
           submitted_at = NOW()`,
    [
      input.assignmentId,
      input.studentId,
      input.isLate ? 'LATE' : 'SUBMITTED',
      input.content,
      input.attachmentUrl,
    ],
  );
};

/** Marks every un-submitted assignment past its due date as MISSING. */
export const markOverdueAsMissing = async (executor: Queryable = pool): Promise<number> => {
  const result = await executor.query(
    `UPDATE submissions sub
        SET status = 'MISSING'::submission_status
       FROM assignments a
      WHERE sub.assignment_id = a.id
        AND a.due_date < CURRENT_DATE
        AND a.status = 'PUBLISHED'
        AND sub.status = 'PENDING'`,
  );

  return result.rowCount ?? 0;
};
