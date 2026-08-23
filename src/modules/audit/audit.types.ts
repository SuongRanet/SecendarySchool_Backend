import type { AuditAction } from '../../types';

export interface AuditLogRow {
  id: number;
  user_id: number | null;
  action: AuditAction;
  entity_type: string;
  entity_id: number | null;
  description: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  username?: string | null;
}

export interface AuditLogEntry {
  id: number;
  userId: number | null;
  username: string | null;
  action: AuditAction;
  entityType: string;
  entityId: number | null;
  description: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface RecordAuditInput {
  userId: number | null;
  action: AuditAction;
  entityType: string;
  entityId?: number | null;
  description?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogFilters {
  userId?: number;
  action?: AuditAction;
  entityType?: string;
  entityId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}
