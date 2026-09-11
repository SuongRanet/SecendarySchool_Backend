import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams, SortParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { ACTIVE_YEAR, buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  CreateSubjectInput,
  SubjectFilters,
  SubjectRow,
  UpdateSubjectInput,
} from './subject.types';

export const SUBJECT_SORT_COLUMNS = ['code', 'name_en', 'is_active'] as const;
export type SubjectSortColumn = (typeof SUBJECT_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<SubjectSortColumn, string> = {
  code: 's.code',
  name_en: 's.name_en',
  is_active: 's.is_active',
};

const EXTRA_SELECT = `
  COALESCE(
    (SELECT ARRAY_AGG(gs.grade_level_id ORDER BY gs.grade_level_id)
       FROM grade_subjects gs WHERE gs.subject_id = s.id),
    ARRAY[]::bigint[]
  ) AS grade_level_ids,
  /*
   * Both counts describe the year the school is in. A class_subjects row carries
   * no year of its own -- it hangs off a class, and a class belongs to a year --
   * so counting it directly summed every year the subject has ever been taught.
   * Every subject on the list showed seventeen classes once a second year
   * existed: nine this year plus eight last.
   */
  (SELECT COUNT(*)::int
     FROM class_subjects cs
     JOIN classes c ON c.id = cs.class_id
    WHERE cs.subject_id = s.id AND cs.is_active
      AND c.deleted_at IS NULL
      AND c.academic_year_id = ${ACTIVE_YEAR}) AS class_count,
  (SELECT COUNT(DISTINCT cs2.teacher_id)::int
     FROM class_subjects cs2
     JOIN classes c2 ON c2.id = cs2.class_id
    WHERE cs2.subject_id = s.id AND cs2.teacher_id IS NOT NULL
      AND c2.deleted_at IS NULL
      AND c2.academic_year_id = ${ACTIVE_YEAR}) AS teacher_count
`;

const buildConditions = (filters: SubjectFilters, builder: ParamBuilder): string[] => {
  const conditions = ['s.deleted_at IS NULL'];

  if (filters.isActive !== undefined) {
    conditions.push(`s.is_active = ${builder.add(filters.isActive)}`);
  }

  if (filters.gradeLevelId !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM grade_subjects gs2
                WHERE gs2.subject_id = s.id AND gs2.grade_level_id = ${builder.add(filters.gradeLevelId)})`,
    );
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(`(s.name_en ILIKE ${pattern} OR s.name_kh ILIKE ${pattern} OR s.code ILIKE ${pattern})`);
  }

  return conditions;
};

export const findSubjects = async (
  filters: SubjectFilters,
  pagination: PaginationParams,
  sort: SortParams<SubjectSortColumn>,
): Promise<PaginatedResult<SubjectRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM subjects s ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<SubjectRow>(
    `SELECT s.*, ${EXTRA_SELECT}
       FROM subjects s
       ${where}
      ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder}, s.id ASC
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAllSubjects = async (filters: SubjectFilters = {}): Promise<SubjectRow[]> => {
  const builder = new ParamBuilder();

  const result = await pool.query<SubjectRow>(
    `SELECT s.*, ${EXTRA_SELECT}
       FROM subjects s
      WHERE ${buildConditions(filters, builder).join(' AND ')}
      ORDER BY s.name_en ASC`,
    builder.params,
  );

  return result.rows;
};

export const findSubjectById = async (
  id: number,
  executor: Queryable = pool,
): Promise<SubjectRow | null> => {
  const result = await executor.query<SubjectRow>(
    `SELECT s.*, ${EXTRA_SELECT} FROM subjects s WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const findSubjectByCode = async (
  code: string,
  excludeId?: number,
  executor: Queryable = pool,
): Promise<SubjectRow | null> => {
  const params: unknown[] = [code];
  let sql = 'SELECT * FROM subjects WHERE LOWER(code) = LOWER($1) AND deleted_at IS NULL';

  if (excludeId !== undefined) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }

  const result = await executor.query<SubjectRow>(sql, params);
  return result.rows[0] ?? null;
};

export const insertSubject = async (
  input: CreateSubjectInput,
  executor: Queryable = pool,
): Promise<SubjectRow> => {
  const result = await executor.query<SubjectRow>(
    `INSERT INTO subjects (code, name_en, name_kh, description, is_active)
     VALUES ($1, $2, $3, $4, COALESCE($5, TRUE))
     RETURNING *`,
    [input.code, input.nameEn, input.nameKh ?? null, input.description ?? null, input.isActive ?? null],
  );

  return result.rows[0];
};

export const updateSubject = async (
  id: number,
  input: UpdateSubjectInput,
  executor: Queryable = pool,
): Promise<SubjectRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    code: { column: 'code' },
    nameEn: { column: 'name_en' },
    nameKh: { column: 'name_kh' },
    description: { column: 'description' },
    isActive: { column: 'is_active' },
  });

  if (assignments.length === 0) {
    return findSubjectById(id, executor);
  }

  params.push(id);

  const result = await executor.query<SubjectRow>(
    `UPDATE subjects SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL
      RETURNING *`,
    params,
  );

  return result.rows[0] ?? null;
};

export const softDeleteSubject = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE subjects SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

/** Replaces the grade levels a subject is offered at. */
export const replaceGradeLevels = async (
  subjectId: number,
  gradeLevelIds: readonly number[],
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('DELETE FROM grade_subjects WHERE subject_id = $1', [subjectId]);

  if (gradeLevelIds.length === 0) {
    return;
  }

  await executor.query(
    `INSERT INTO grade_subjects (subject_id, grade_level_id)
     SELECT $1, grade_level_id FROM UNNEST($2::bigint[]) AS grade_level_id
     ON CONFLICT (grade_level_id, subject_id) DO NOTHING`,
    [subjectId, gradeLevelIds],
  );
};

export const countActiveClassSubjects = async (
  subjectId: number,
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id
       JOIN academic_years y ON y.id = c.academic_year_id
      WHERE cs.subject_id = $1 AND y.status <> 'CLOSED' AND c.deleted_at IS NULL`,
    [subjectId],
  );

  return result.rows[0]?.count ?? 0;
};
