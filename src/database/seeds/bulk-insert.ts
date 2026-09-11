import type { PoolClient } from 'pg';

/**
 * Inserts many rows in batches rather than one statement per row.
 *
 * A year's register alone runs to tens of thousands of rows; sending those one
 * at a time turns a two-second seed into a two-minute one. The chunk size keeps
 * each statement well inside PostgreSQL's 65535-parameter ceiling even for the
 * widest table here.
 *
 * `casts` names the columns that need an explicit cast because their type is an
 * enum — PostgreSQL will not infer `attendance_status` from a bare string.
 */
export const insertMany = async (
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  casts: Record<number, string> = {},
): Promise<number> => {
  const CHUNK = 500;

  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value, index) => {
        values.push(value);

        return `$${values.length}${casts[index] ? `::${casts[index]}` : ''}`;
      });

      return `(${placeholders.join(', ')})`;
    });

    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
      values,
    );
  }

  return rows.length;
};

/**
 * A small deterministic pseudo-random generator (mulberry32).
 *
 * Seeding from a fixed number means a re-run rebuilds the same school rather
 * than a different one, so a bug found in a seeded record can be reproduced.
 */
export const makeRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const pad = (value: number, width: number): string => String(value).padStart(width, '0');
