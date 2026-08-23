import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginationParams, PaginatedResult, SortParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import type { AuditLogFilters, AuditLogRow, RecordAuditInput } from './audit.types';

export const AUDIT_SORT_COLUMNS = ['created_at', 'action', 'entity_type'] as const;
export type AuditSortColumn = (typeof AUDIT_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<AuditSortColumn, string> = {
  created_at: 'a.created_at',
  action: 'a.action',
  entity_type: 'a.entity_type',
};

export const insertAuditLog = async (
  input: RecordAuditInput,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, description, old_value, new_value, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.userId,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.description ?? null,
      input.oldValue ? JSON.stringify(input.oldValue) : null,
      input.newValue ? JSON.stringify(input.newValue) : null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ],
  );
};

export const findAuditLogs = async (
  filters: AuditLogFilters,
  pagination: PaginationParams,
  sort: SortParams<AuditSortColumn>,
): Promise<PaginatedResult<AuditLogRow>> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.userId !== undefined) {
    params.push(filters.userId);
    conditions.push(`a.user_id = $${params.length}`);
  }

  if (filters.action) {
    params.push(filters.action);
    conditions.push(`a.action = $${params.length}`);
  }

  if (filters.entityType) {
    params.push(filters.entityType);
    conditions.push(`a.entity_type = $${params.length}`);
  }

  if (filters.entityId !== undefined) {
    params.push(filters.entityId);
    conditions.push(`a.entity_id = $${params.length}`);
  }

  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`a.created_at >= $${params.length}::timestamptz`);
  }

  if (filters.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`a.created_at <= $${params.length}::timestamptz`);
  }

  if (filters.search) {
    params.push(buildSearchPattern(filters.search));
    conditions.push(
      `(a.description ILIKE $${params.length} OR a.entity_type ILIKE $${params.length} OR u.username ILIKE $${params.length})`,
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${whereClause}`,
    params,
  );

  const listParams = [...params, pagination.limit, pagination.offset];

  const rowsResult = await pool.query<AuditLogRow>(
    `SELECT a.*, u.username
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${whereClause}
      ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder}, a.id DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  return { rows: rowsResult.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAuditLogsForEntity = async (
  entityType: string,
  entityId: number,
  limit: number,
): Promise<AuditLogRow[]> => {
  const result = await pool.query<AuditLogRow>(
    `SELECT a.*, u.username
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.entity_type = $1 AND a.entity_id = $2
      ORDER BY a.created_at DESC
      LIMIT $3`,
    [entityType, entityId, limit],
  );

  return result.rows;
};
