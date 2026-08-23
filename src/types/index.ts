import type { RoleCode, UserStatus } from './enums';

export * from './enums';

/** The authenticated principal attached to every protected request. */
export interface AuthenticatedUser {
  id: number;
  username: string;
  email: string;
  status: UserStatus;
  roles: RoleCode[];
  permissions: string[];
  /** Populated when the user has a teacher profile. */
  teacherId: number | null;
  /** Populated when the user has a student profile. */
  studentId: number | null;
  /** Populated when the user has a parent profile. */
  parentId: number | null;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface SortParams<TColumn extends string = string> {
  sortBy: TColumn;
  sortOrder: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
}

export interface AuditContext {
  userId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
}
