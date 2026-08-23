import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams, SortParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  AcademicTermRow,
  AcademicYearFilters,
  AcademicYearRow,
  CreateAcademicTermInput,
  CreateAcademicYearInput,
  UpdateAcademicYearInput,
} from './academic-year.types';

export const ACADEMIC_YEAR_SORT_COLUMNS = ['name', 'start_date', 'end_date', 'status'] as const;
export type AcademicYearSortColumn = (typeof ACADEMIC_YEAR_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<AcademicYearSortColumn, string> = {
  name: 'y.name',
  start_date: 'y.start_date',
  end_date: 'y.end_date',
  status: 'y.status',
};

const COUNT_SELECT = `
  (SELECT COUNT(*)::int FROM classes c WHERE c.academic_year_id = y.id AND c.deleted_at IS NULL) AS class_count,
  (SELECT COUNT(*)::int FROM enrollments e WHERE e.academic_year_id = y.id) AS enrollment_count
`;

export const findAcademicYears = async (
  filters: AcademicYearFilters,
  pagination: PaginationParams,
  sort: SortParams<AcademicYearSortColumn>,
): Promise<PaginatedResult<AcademicYearRow>> => {
  const builder = new ParamBuilder();
  const conditions: string[] = [];

  if (filters.status) {
    conditions.push(`y.status = ${builder.add(filters.status)}::academic_year_status`);
  }

  if (filters.search) {
    conditions.push(`y.name ILIKE ${builder.add(buildSearchPattern(filters.search))}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM academic_years y ${where}`,
    builder.params,
  );

  const limitPlaceholder = builder.add(pagination.limit);
  const offsetPlaceholder = builder.add(pagination.offset);

  const rows = await pool.query<AcademicYearRow>(
    `SELECT y.*, ${COUNT_SELECT}
       FROM academic_years y
       ${where}
      ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder}, y.id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAllAcademicYears = async (): Promise<AcademicYearRow[]> => {
  const result = await pool.query<AcademicYearRow>(
    `SELECT y.*, ${COUNT_SELECT} FROM academic_years y ORDER BY y.start_date DESC`,
  );

  return result.rows;
};

export const findAcademicYearById = async (
  id: number,
  executor: Queryable = pool,
): Promise<AcademicYearRow | null> => {
  const result = await executor.query<AcademicYearRow>(
    `SELECT y.*, ${COUNT_SELECT} FROM academic_years y WHERE y.id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const findActiveAcademicYear = async (
  executor: Queryable = pool,
): Promise<AcademicYearRow | null> => {
  const result = await executor.query<AcademicYearRow>(
    `SELECT y.*, ${COUNT_SELECT} FROM academic_years y WHERE y.is_active LIMIT 1`,
  );

  return result.rows[0] ?? null;
};

export const findAcademicYearByName = async (
  name: string,
  excludeId?: number,
  executor: Queryable = pool,
): Promise<AcademicYearRow | null> => {
  const params: unknown[] = [name];
  let sql = 'SELECT * FROM academic_years WHERE LOWER(name) = LOWER($1)';

  if (excludeId !== undefined) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }

  const result = await executor.query<AcademicYearRow>(sql, params);
  return result.rows[0] ?? null;
};

/** Finds any year whose date range overlaps the given range. */
export const findOverlappingAcademicYear = async (
  startDate: string,
  endDate: string,
  excludeId?: number,
  executor: Queryable = pool,
): Promise<AcademicYearRow | null> => {
  const params: unknown[] = [startDate, endDate];
  let sql = `SELECT * FROM academic_years
              WHERE start_date <= $2::date AND end_date >= $1::date`;

  if (excludeId !== undefined) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }

  const result = await executor.query<AcademicYearRow>(`${sql} LIMIT 1`, params);
  return result.rows[0] ?? null;
};

export const insertAcademicYear = async (
  input: CreateAcademicYearInput,
  executor: Queryable = pool,
): Promise<AcademicYearRow> => {
  const result = await executor.query<AcademicYearRow>(
    `INSERT INTO academic_years (name, start_date, end_date, status, is_active)
     VALUES ($1, $2::date, $3::date,
             CASE WHEN $4::boolean THEN 'ACTIVE'::academic_year_status ELSE 'UPCOMING'::academic_year_status END,
             $4::boolean)
     RETURNING *`,
    [input.name, input.startDate, input.endDate, input.setActive ?? false],
  );

  return result.rows[0];
};

export const updateAcademicYear = async (
  id: number,
  input: UpdateAcademicYearInput,
  executor: Queryable = pool,
): Promise<AcademicYearRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    name: { column: 'name' },
    startDate: { column: 'start_date', cast: 'date' },
    endDate: { column: 'end_date', cast: 'date' },
  });

  if (assignments.length === 0) {
    return findAcademicYearById(id, executor);
  }

  params.push(id);

  const result = await executor.query<AcademicYearRow>(
    `UPDATE academic_years SET ${assignments.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );

  return result.rows[0] ?? null;
};

/** Clears the active flag from every year; run before activating a new one. */
export const deactivateAllAcademicYears = async (executor: Queryable = pool): Promise<void> => {
  await executor.query(
    `UPDATE academic_years
        SET is_active = FALSE,
            status = CASE WHEN status = 'ACTIVE' THEN 'UPCOMING'::academic_year_status ELSE status END
      WHERE is_active`,
  );
};

export const activateAcademicYear = async (
  id: number,
  executor: Queryable = pool,
): Promise<AcademicYearRow | null> => {
  const result = await executor.query<AcademicYearRow>(
    `UPDATE academic_years
        SET is_active = TRUE, status = 'ACTIVE'::academic_year_status, closed_at = NULL, closed_by = NULL
      WHERE id = $1
      RETURNING *`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const closeAcademicYear = async (
  id: number,
  closedBy: number | null,
  executor: Queryable = pool,
): Promise<AcademicYearRow | null> => {
  const result = await executor.query<AcademicYearRow>(
    `UPDATE academic_years
        SET status = 'CLOSED'::academic_year_status,
            is_active = FALSE,
            closed_at = NOW(),
            closed_by = $2
      WHERE id = $1
      RETURNING *`,
    [id, closedBy],
  );

  return result.rows[0] ?? null;
};

export const deleteAcademicYear = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query('DELETE FROM academic_years WHERE id = $1', [id]);
  return result.rowCount !== null && result.rowCount > 0;
};

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export const findTermsByYear = async (
  academicYearId: number,
  executor: Queryable = pool,
): Promise<AcademicTermRow[]> => {
  const result = await executor.query<AcademicTermRow>(
    'SELECT * FROM academic_terms WHERE academic_year_id = $1 ORDER BY term_order ASC',
    [academicYearId],
  );

  return result.rows;
};

export const findTermById = async (
  id: number,
  executor: Queryable = pool,
): Promise<AcademicTermRow | null> => {
  const result = await executor.query<AcademicTermRow>(
    'SELECT * FROM academic_terms WHERE id = $1',
    [id],
  );

  return result.rows[0] ?? null;
};

export const insertTerm = async (
  academicYearId: number,
  input: CreateAcademicTermInput,
  executor: Queryable = pool,
): Promise<AcademicTermRow> => {
  const result = await executor.query<AcademicTermRow>(
    `INSERT INTO academic_terms (academic_year_id, name, term_order, start_date, end_date)
     VALUES ($1, $2, $3, $4::date, $5::date)
     RETURNING *`,
    [academicYearId, input.name, input.termOrder, input.startDate, input.endDate],
  );

  return result.rows[0];
};

export const updateTerm = async (
  id: number,
  input: Partial<CreateAcademicTermInput>,
  executor: Queryable = pool,
): Promise<AcademicTermRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    name: { column: 'name' },
    termOrder: { column: 'term_order' },
    startDate: { column: 'start_date', cast: 'date' },
    endDate: { column: 'end_date', cast: 'date' },
  });

  if (assignments.length === 0) {
    return findTermById(id, executor);
  }

  params.push(id);

  const result = await executor.query<AcademicTermRow>(
    `UPDATE academic_terms SET ${assignments.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );

  return result.rows[0] ?? null;
};

export const activateTerm = async (
  id: number,
  academicYearId: number,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('UPDATE academic_terms SET is_active = FALSE WHERE academic_year_id = $1', [
    academicYearId,
  ]);
  await executor.query('UPDATE academic_terms SET is_active = TRUE WHERE id = $1', [id]);
};

export const deleteTerm = async (id: number, executor: Queryable = pool): Promise<boolean> => {
  const result = await executor.query('DELETE FROM academic_terms WHERE id = $1', [id]);
  return result.rowCount !== null && result.rowCount > 0;
};
