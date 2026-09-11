import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import { buildSearchPattern } from '../../utils/pagination';
import { ACTIVE_YEAR, buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  CreateGradeLevelInput,
  GradeLevelFilters,
  GradeLevelRow,
  UpdateGradeLevelInput,
} from './grade-level.types';

/*
 * Both figures describe the year the school is in.
 *
 * A grade level outlives the years it is taught in, so counting its classes
 * across all of them showed Grade 7 with six sections -- this year's three on
 * top of last year's three -- for a school that has never run more than three.
 */
const COUNT_SELECT = `
  (SELECT COUNT(*)::int FROM classes c
    WHERE c.grade_level_id = g.id AND c.deleted_at IS NULL
      AND c.academic_year_id = ${ACTIVE_YEAR}) AS class_count,
  (SELECT COUNT(DISTINCT e.student_id)::int
     FROM enrollments e
     JOIN classes c2 ON c2.id = e.class_id
    WHERE c2.grade_level_id = g.id AND e.status = 'ACTIVE'
      AND c2.deleted_at IS NULL
      AND c2.academic_year_id = ${ACTIVE_YEAR}) AS student_count
`;

export const findGradeLevels = async (filters: GradeLevelFilters): Promise<GradeLevelRow[]> => {
  const builder = new ParamBuilder();
  const conditions = ['g.deleted_at IS NULL'];

  if (filters.isActive !== undefined) {
    conditions.push(`g.is_active = ${builder.add(filters.isActive)}`);
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(`(g.name_en ILIKE ${pattern} OR g.name_kh ILIKE ${pattern} OR g.code ILIKE ${pattern})`);
  }

  const result = await pool.query<GradeLevelRow>(
    `SELECT g.*, ${COUNT_SELECT}
       FROM grade_levels g
      WHERE ${conditions.join(' AND ')}
      ORDER BY g.level_order ASC`,
    builder.params,
  );

  return result.rows;
};

export const findGradeLevelById = async (
  id: number,
  executor: Queryable = pool,
): Promise<GradeLevelRow | null> => {
  const result = await executor.query<GradeLevelRow>(
    `SELECT g.*, ${COUNT_SELECT} FROM grade_levels g WHERE g.id = $1 AND g.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const findConflictingGradeLevel = async (
  code: string | undefined,
  levelOrder: number | undefined,
  excludeId?: number,
  executor: Queryable = pool,
): Promise<GradeLevelRow | null> => {
  if (code === undefined && levelOrder === undefined) {
    return null;
  }

  const builder = new ParamBuilder();
  const clauses: string[] = [];

  if (code !== undefined) {
    clauses.push(`LOWER(code) = LOWER(${builder.add(code)})`);
  }

  if (levelOrder !== undefined) {
    clauses.push(`level_order = ${builder.add(levelOrder)}`);
  }

  let sql = `SELECT * FROM grade_levels WHERE (${clauses.join(' OR ')})`;

  if (excludeId !== undefined) {
    sql += ` AND id <> ${builder.add(excludeId)}`;
  }

  const result = await executor.query<GradeLevelRow>(`${sql} LIMIT 1`, builder.params);
  return result.rows[0] ?? null;
};

export const insertGradeLevel = async (
  input: CreateGradeLevelInput,
  executor: Queryable = pool,
): Promise<GradeLevelRow> => {
  const result = await executor.query<GradeLevelRow>(
    `INSERT INTO grade_levels (code, name_en, name_kh, level_order, description, is_active)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE))
     RETURNING *`,
    [
      input.code,
      input.nameEn,
      input.nameKh ?? null,
      input.levelOrder,
      input.description ?? null,
      input.isActive ?? null,
    ],
  );

  return result.rows[0];
};

export const updateGradeLevel = async (
  id: number,
  input: UpdateGradeLevelInput,
  executor: Queryable = pool,
): Promise<GradeLevelRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    code: { column: 'code' },
    nameEn: { column: 'name_en' },
    nameKh: { column: 'name_kh' },
    levelOrder: { column: 'level_order' },
    description: { column: 'description' },
    isActive: { column: 'is_active' },
  });

  if (assignments.length === 0) {
    return findGradeLevelById(id, executor);
  }

  params.push(id);

  const result = await executor.query<GradeLevelRow>(
    `UPDATE grade_levels SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL
      RETURNING *`,
    params,
  );

  return result.rows[0] ?? null;
};

export const softDeleteGradeLevel = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE grade_levels SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

/** Applies a new display order to several grade levels at once. */
export const reorderGradeLevels = async (
  order: { id: number; levelOrder: number }[],
  executor: Queryable = pool,
): Promise<void> => {
  // Shift into a temporary range first so the unique level_order index never
  // sees a duplicate midway through the swap.
  await executor.query(
    `UPDATE grade_levels SET level_order = level_order + 1000
      WHERE id = ANY($1::bigint[])`,
    [order.map((item) => item.id)],
  );

  await executor.query(
    `UPDATE grade_levels AS g
        SET level_order = v.level_order
       FROM (SELECT UNNEST($1::bigint[]) AS id, UNNEST($2::int[]) AS level_order) AS v
      WHERE g.id = v.id`,
    [order.map((item) => item.id), order.map((item) => item.levelOrder)],
  );
};
