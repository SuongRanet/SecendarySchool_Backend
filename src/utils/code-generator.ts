import type { Queryable } from '../database/connection';
import { pool } from '../database/connection';

/**
 * Generates the next human readable code for a domain record, e.g. `STU-2026-0007`.
 *
 * The maximum existing suffix is read inside the caller's transaction, so two
 * concurrent inserts cannot receive the same code — the unique index on the column
 * is the final guarantee.
 */
export const generateSequentialCode = async (
  table: 'students' | 'teachers' | 'parents',
  column: 'student_code' | 'teacher_code' | 'parent_code',
  prefix: string,
  executor: Queryable = pool,
  padding = 4,
): Promise<string> => {
  const result = await executor.query<{ max_suffix: number | null }>(
    `SELECT MAX(NULLIF(REGEXP_REPLACE(${column}, '^.*[^0-9]', ''), '')::bigint) AS max_suffix
       FROM ${table}
      WHERE ${column} LIKE $1`,
    [`${prefix}%`],
  );

  const next = (result.rows[0]?.max_suffix ?? 0) + 1;

  return `${prefix}${String(next).padStart(padding, '0')}`;
};

/** `STU-2026-` — codes carry the year so a roll-over never collides. */
export const buildYearPrefix = (base: string, year = new Date().getFullYear()): string =>
  `${base}-${year}-`;
