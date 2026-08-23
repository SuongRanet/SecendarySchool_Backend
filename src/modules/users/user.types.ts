import type { RoleCode, UserStatus } from '../../types';

export interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  status: UserStatus;
  email_verified_at: Date | null;
  last_login_at: Date | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface UserListRow extends Omit<UserRow, 'password_hash'> {
  roles: RoleCode[] | null;
  full_name: string | null;
  profile_type: 'TEACHER' | 'STUDENT' | 'PARENT' | null;
}

export interface RoleSummary {
  id: number;
  code: RoleCode;
  name: string;
}

/** The user representation returned by the API — never contains `password_hash`. */
export interface UserDto {
  id: number;
  username: string;
  email: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  roles: RoleCode[];
  fullName: string | null;
  profileType: 'TEACHER' | 'STUDENT' | 'PARENT' | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDetailDto extends UserDto {
  permissions: string[];
  teacherId: number | null;
  studentId: number | null;
  parentId: number | null;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  status?: UserStatus;
  roleCodes: RoleCode[];
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  status?: UserStatus;
}

export interface UserFilters {
  search?: string;
  status?: UserStatus;
  roleCode?: RoleCode;
  includeDeleted?: boolean;
}
