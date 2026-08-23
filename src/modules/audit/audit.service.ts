import type { Queryable } from '../../database/connection';
import type { PaginationParams, PaginatedResult, SortParams } from '../../types';
import { logger } from '../../utils/logger';
import * as auditRepository from './audit.repository';
import type { AuditSortColumn } from './audit.repository';
import type { AuditLogEntry, AuditLogFilters, AuditLogRow, RecordAuditInput } from './audit.types';

const toEntry = (row: AuditLogRow): AuditLogEntry => ({
  id: row.id,
  userId: row.user_id,
  username: row.username ?? null,
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id,
  description: row.description,
  oldValue: row.old_value,
  newValue: row.new_value,
  ipAddress: row.ip_address,
  createdAt: row.created_at,
});

/**
 * Writes an audit entry for a sensitive mutation. Audit logging must never break
 * the operation that triggered it, so a failure here is logged and swallowed
 * unless the caller passes a transaction executor — inside a transaction the
 * failure has to surface so the whole unit of work rolls back.
 */
export const record = async (input: RecordAuditInput, executor?: Queryable): Promise<void> => {
  if (executor) {
    await auditRepository.insertAuditLog(input, executor);
    return;
  }

  try {
    await auditRepository.insertAuditLog(input);
  } catch (error) {
    logger.error('Failed to write audit log', { input, error });
  }
};

export const list = async (
  filters: AuditLogFilters,
  pagination: PaginationParams,
  sort: SortParams<AuditSortColumn>,
): Promise<PaginatedResult<AuditLogEntry>> => {
  const result = await auditRepository.findAuditLogs(filters, pagination, sort);

  return { rows: result.rows.map(toEntry), total: result.total };
};

export const listForEntity = async (
  entityType: string,
  entityId: number,
  limit = 50,
): Promise<AuditLogEntry[]> => {
  const rows = await auditRepository.findAuditLogsForEntity(entityType, entityId, limit);
  return rows.map(toEntry);
};

/**
 * Produces a shallow diff of the fields that actually changed so audit entries
 * stay small and readable instead of storing whole row snapshots.
 */
export const diff = <T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { oldValue: Record<string, unknown>; newValue: Record<string, unknown> } => {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(after)) {
    if (value === undefined) {
      continue;
    }

    const previous = before[key as keyof T];

    if (JSON.stringify(previous) !== JSON.stringify(value)) {
      oldValue[key] = previous ?? null;
      newValue[key] = value;
    }
  }

  return { oldValue, newValue };
};
