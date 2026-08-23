import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  BehaviorFilters,
  BehaviorRow,
  BehaviorSummary,
  CreateBehaviorInput,
  CreateCommentInput,
  StudentCommentRow,
  UpdateBehaviorInput,
} from './behavior.types';

const BASE_SELECT = `
  SELECT b.*,
         s.student_code,
         s.first_name_en AS student_first_name,
         s.last_name_en AS student_last_name,
         c.name AS class_name,
         NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), '') AS teacher_name
    FROM student_behaviors b
    JOIN students s ON s.id = b.student_id
    LEFT JOIN classes c ON c.id = b.class_id
    LEFT JOIN teachers t ON t.id = b.teacher_id
`;

const buildConditions = (filters: BehaviorFilters, builder: ParamBuilder): string[] => {
  const conditions = ['b.deleted_at IS NULL', 's.deleted_at IS NULL'];

  if (filters.studentId !== undefined) {
    conditions.push(`b.student_id = ${builder.add(filters.studentId)}`);
  }

  if (filters.classId !== undefined) {
    conditions.push(`b.class_id = ${builder.add(filters.classId)}`);
  }

  if (filters.academicYearId !== undefined) {
    conditions.push(`b.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.type) {
    conditions.push(`b.type = ${builder.add(filters.type)}::behavior_type`);
  }

  if (filters.dateFrom) {
    conditions.push(`b.occurred_on >= ${builder.add(filters.dateFrom)}::date`);
  }

  if (filters.dateTo) {
    conditions.push(`b.occurred_on <= ${builder.add(filters.dateTo)}::date`);
  }

  if (filters.visibleToParentOnly) {
    conditions.push('b.visible_to_parent');
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(
      `(b.title ILIKE ${pattern}
        OR b.description ILIKE ${pattern}
        OR CONCAT(s.first_name_en, ' ', s.last_name_en) ILIKE ${pattern})`,
    );
  }

  return conditions;
};

export const findBehaviors = async (
  filters: BehaviorFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<BehaviorRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM student_behaviors b
       JOIN students s ON s.id = b.student_id
       ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<BehaviorRow>(
    `${BASE_SELECT} ${where}
      ORDER BY b.occurred_on DESC, b.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findBehaviorById = async (
  id: number,
  executor: Queryable = pool,
): Promise<BehaviorRow | null> => {
  const result = await executor.query<BehaviorRow>(
    `${BASE_SELECT} WHERE b.id = $1 AND b.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const insertBehavior = async (
  input: CreateBehaviorInput & {
    academicYearId: number;
    teacherId: number | null;
    recordedBy: number | null;
  },
  executor: Queryable = pool,
): Promise<BehaviorRow> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO student_behaviors (
        student_id, academic_year_id, class_id, teacher_id, type, title, description,
        occurred_on, points, action_taken, visible_to_parent, recorded_by
     ) VALUES (
        $1, $2, $3, $4, $5::behavior_type, $6, $7,
        COALESCE($8::date, CURRENT_DATE), COALESCE($9, 0), $10, COALESCE($11, TRUE), $12
     )
     RETURNING id`,
    [
      input.studentId,
      input.academicYearId,
      input.classId ?? null,
      input.teacherId,
      input.type,
      input.title,
      input.description ?? null,
      input.occurredOn ?? null,
      input.points ?? null,
      input.actionTaken ?? null,
      input.visibleToParent ?? null,
      input.recordedBy,
    ],
  );

  return (await findBehaviorById(result.rows[0].id, executor)) as BehaviorRow;
};

export const updateBehavior = async (
  id: number,
  input: UpdateBehaviorInput,
  executor: Queryable = pool,
): Promise<BehaviorRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    classId: { column: 'class_id' },
    type: { column: 'type', cast: 'behavior_type' },
    title: { column: 'title' },
    description: { column: 'description' },
    occurredOn: { column: 'occurred_on', cast: 'date' },
    points: { column: 'points' },
    actionTaken: { column: 'action_taken' },
    visibleToParent: { column: 'visible_to_parent' },
  });

  if (assignments.length === 0) {
    return findBehaviorById(id, executor);
  }

  params.push(id);

  await executor.query(
    `UPDATE student_behaviors SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL`,
    params,
  );

  return findBehaviorById(id, executor);
};

export const softDeleteBehavior = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE student_behaviors SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

export const summarize = async (
  studentId: number,
  academicYearId?: number,
): Promise<BehaviorSummary> => {
  const builder = new ParamBuilder();
  const conditions = [
    `b.student_id = ${builder.add(studentId)}`,
    'b.deleted_at IS NULL',
  ];

  if (academicYearId !== undefined) {
    conditions.push(`b.academic_year_id = ${builder.add(academicYearId)}`);
  }

  const totals = await pool.query<{
    positive: number;
    warnings: number;
    disciplinary: number;
    totalPoints: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE b.type IN ('ACHIEVEMENT','POSITIVE','PARTICIPATION','TEAMWORK','RESPONSIBILITY','COMMUNICATION'))::int AS positive,
       COUNT(*) FILTER (WHERE b.type = 'WARNING')::int AS warnings,
       COUNT(*) FILTER (WHERE b.type = 'DISCIPLINARY')::int AS disciplinary,
       COALESCE(SUM(b.points), 0)::int AS "totalPoints"
     FROM student_behaviors b
     WHERE ${conditions.join(' AND ')}`,
    builder.params,
  );

  const byType = await pool.query<{ type: BehaviorRow['type']; count: number }>(
    `SELECT b.type, COUNT(*)::int AS count
       FROM student_behaviors b
      WHERE ${conditions.join(' AND ')}
      GROUP BY b.type
      ORDER BY count DESC`,
    builder.params,
  );

  return {
    ...(totals.rows[0] ?? { positive: 0, warnings: 0, disciplinary: 0, totalPoints: 0 }),
    byType: byType.rows,
  };
};

// ---------------------------------------------------------------------------
// Teacher comments
// ---------------------------------------------------------------------------

export const findComments = async (
  studentId: number,
  filters: { academicYearId?: number; termId?: number; visibleToParentOnly?: boolean },
): Promise<StudentCommentRow[]> => {
  const builder = new ParamBuilder();
  const conditions = [
    `sc.student_id = ${builder.add(studentId)}`,
    'sc.deleted_at IS NULL',
  ];

  if (filters.academicYearId !== undefined) {
    conditions.push(`sc.academic_year_id = ${builder.add(filters.academicYearId)}`);
  }

  if (filters.termId !== undefined) {
    conditions.push(`sc.term_id = ${builder.add(filters.termId)}`);
  }

  if (filters.visibleToParentOnly) {
    conditions.push('sc.visible_to_parent');
  }

  const result = await pool.query<StudentCommentRow>(
    `SELECT sc.*,
            NULLIF(TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)), '') AS teacher_name,
            s.name_en AS subject_name,
            term.name AS term_name
       FROM student_comments sc
       LEFT JOIN teachers t ON t.id = sc.teacher_id
       LEFT JOIN subjects s ON s.id = sc.subject_id
       LEFT JOIN academic_terms term ON term.id = sc.term_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY sc.created_at DESC`,
    builder.params,
  );

  return result.rows;
};

export const insertComment = async (
  input: CreateCommentInput & {
    academicYearId: number;
    teacherId: number | null;
    createdBy: number | null;
  },
  executor: Queryable = pool,
): Promise<StudentCommentRow> => {
  const result = await executor.query<StudentCommentRow>(
    `INSERT INTO student_comments (
        student_id, academic_year_id, term_id, class_id, subject_id, teacher_id,
        is_homeroom, comment, visible_to_parent, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, FALSE), $8, COALESCE($9, TRUE), $10)
     RETURNING *`,
    [
      input.studentId,
      input.academicYearId,
      input.termId ?? null,
      input.classId ?? null,
      input.subjectId ?? null,
      input.teacherId,
      input.isHomeroom ?? null,
      input.comment,
      input.visibleToParent ?? null,
      input.createdBy,
    ],
  );

  return result.rows[0];
};

export const softDeleteComment = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE student_comments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};
