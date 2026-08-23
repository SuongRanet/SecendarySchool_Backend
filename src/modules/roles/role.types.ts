import type { RoleCode } from '../../types';

export interface RoleRow {
  id: number;
  code: RoleCode;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
  permissions: string[] | null;
  user_count: number;
}

export interface PermissionRow {
  id: number;
  code: string;
  name: string;
  module: string;
  description: string | null;
}

export interface RoleDto {
  id: number;
  code: RoleCode;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface PermissionDto {
  id: number;
  code: string;
  name: string;
  module: string;
  description: string | null;
}

export interface PermissionGroupDto {
  module: string;
  permissions: PermissionDto[];
}
