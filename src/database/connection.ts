import { Pool, types } from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config';
import { logger } from '../utils/logger';

/**
 * `DATE` columns are returned as plain `YYYY-MM-DD` strings instead of JavaScript
 * `Date` objects so that a birth date or an attendance date never shifts because
 * of the server timezone.
 */
types.setTypeParser(types.builtins.DATE, (value: string) => value);

/** `NUMERIC` is parsed as a JavaScript number; school scores stay well inside the safe range. */
types.setTypeParser(types.builtins.NUMERIC, (value: string) => Number.parseFloat(value));

/** `BIGINT` identifiers stay inside the safe integer range for a school dataset. */
types.setTypeParser(types.builtins.INT8, (value: string) => Number.parseInt(value, 10));

// pg lets a URL `sslmode` override the `ssl` option below (and warns about it), so strip it.
const stripSslParams = (url: string): string => {
  try {
    const parsed = new URL(url);
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
};

export const pool = new Pool({
  connectionString: env.DATABASE_SSL ? stripSslParams(env.DATABASE_URL) : env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (error) => {
  logger.error('Unexpected PostgreSQL pool error', error);
});

/**
 * Anything that can execute SQL: the pool itself, or a client bound to an open
 * transaction. Repositories accept this type so the same method works inside and
 * outside a transaction.
 */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

/** Runs a parameterized statement against the pool. */
export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<T>> => {
  const startedAt = Date.now();
  const result = await pool.query<T>(text, params as unknown[]);
  const duration = Date.now() - startedAt;

  if (env.isDevelopment) {
    logger.debug('SQL executed', {
      duration: `${duration}ms`,
      rows: result.rowCount,
      text: text.replace(/\s+/g, ' ').trim().slice(0, 240),
    });
  }

  return result;
};

/** Returns the first row of a statement, or `null` when nothing matched. */
export const queryOne = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> => {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
};

/** Returns every row of a statement. */
export const queryMany = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> => {
  const result = await query<T>(text, params);
  return result.rows;
};

/**
 * Runs `handler` inside a single transaction. Any thrown error rolls the whole
 * unit of work back, which is what keeps multi-step writes such as
 * "create student -> link parent -> create enrollment" from leaving partial records.
 */
export const withTransaction = async <T>(
  handler: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Failed to roll back transaction', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
};

/** Verifies the database is reachable; used on boot and by the health probe. */
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database connection check failed', error);
    return false;
  }
};

export const closePool = async (): Promise<void> => {
  await pool.end();
};
