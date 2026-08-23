import type { Gender, GuardianRelationship, StudentStatus } from '../../types';

export interface ParentRow {
  id: number;
  user_id: number | null;
  parent_code: string;
  first_name_en: string;
  last_name_en: string;
  first_name_kh: string | null;
  last_name_kh: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  national_id: string | null;
  phone_number: string | null;
  alternate_phone: string | null;
  email: string | null;
  occupation: string | null;
  workplace: string | null;
  address: string | null;
  province: string | null;
  profile_photo: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  username?: string | null;
  children_count?: number;
}

export interface ParentDto {
  id: number;
  userId: number | null;
  username: string | null;
  parentCode: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh: string | null;
  lastNameKh: string | null;
  fullName: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  phoneNumber: string | null;
  alternatePhone: string | null;
  email: string | null;
  occupation: string | null;
  workplace: string | null;
  address: string | null;
  province: string | null;
  profilePhoto: string | null;
  isActive: boolean;
  childrenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateParentInput {
  parentCode?: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh?: string | null;
  lastNameKh?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  nationalId?: string | null;
  phoneNumber?: string | null;
  alternatePhone?: string | null;
  email?: string | null;
  occupation?: string | null;
  workplace?: string | null;
  address?: string | null;
  province?: string | null;
  profilePhoto?: string | null;
  isActive?: boolean;
  children?: {
    studentId: number;
    relationship?: GuardianRelationship;
    isPrimaryContact?: boolean;
    isEmergencyContact?: boolean;
  }[];
  account?: {
    username: string;
    email: string;
    password: string;
  };
}

export type UpdateParentInput = Omit<Partial<CreateParentInput>, 'children' | 'account'>;

export interface ParentFilters {
  search?: string;
  isActive?: boolean;
  studentId?: number;
  hasAccount?: boolean;
}

export interface ParentChildRow {
  link_id: number;
  student_id: number;
  student_code: string;
  first_name_en: string;
  last_name_en: string;
  first_name_kh: string | null;
  last_name_kh: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  profile_photo: string | null;
  status: StudentStatus;
  relationship: GuardianRelationship;
  is_primary_contact: boolean;
  is_emergency_contact: boolean;
  can_pick_up: boolean;
  current_class_id: number | null;
  current_class_name: string | null;
  current_grade_level_name: string | null;
  current_academic_year_id: number | null;
  current_academic_year_name: string | null;
}

export interface ParentChildDto {
  linkId: number;
  studentId: number;
  studentCode: string;
  firstNameEn: string;
  lastNameEn: string;
  fullName: string;
  fullNameKh: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  profilePhoto: string | null;
  status: StudentStatus;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
  isEmergencyContact: boolean;
  canPickUp: boolean;
  currentClassId: number | null;
  currentClassName: string | null;
  currentGradeLevelName: string | null;
  currentAcademicYearId: number | null;
  currentAcademicYearName: string | null;
}
