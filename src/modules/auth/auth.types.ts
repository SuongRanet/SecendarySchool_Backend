import type { RoleCode, UserStatus } from '../../types';

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface AuthProfile {
  id: number;
  username: string;
  email: string;
  status: UserStatus;
  roles: RoleCode[];
  permissions: string[];
  fullName: string | null;
  profileType: 'TEACHER' | 'STUDENT' | 'PARENT' | null;
  teacherId: number | null;
  studentId: number | null;
  parentId: number | null;
  lastLoginAt: Date | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResult {
  user: AuthProfile;
  tokens: AuthTokens;
}

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}
