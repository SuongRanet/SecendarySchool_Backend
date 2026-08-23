import type {
  EnrollmentStatus,
  Gender,
  GuardianRelationship,
  StudentStatus,
} from '../../types';

export interface StudentRow {
  id: number;
  user_id: number | null;
  student_code: string;
  first_name_en: string;
  last_name_en: string;
  first_name_kh: string | null;
  last_name_kh: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  national_id: string | null;
  phone_number: string | null;
  email: string | null;
  current_address: string | null;
  province: string | null;
  profile_photo: string | null;
  enrolled_date: string | null;
  status: StudentStatus;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  username?: string | null;
  current_enrollment_id?: number | null;
  current_class_id?: number | null;
  current_class_name?: string | null;
  current_grade_level_id?: number | null;
  current_grade_level_name?: string | null;
  current_academic_year_id?: number | null;
  current_academic_year_name?: string | null;
  parent_count?: number;
}

export interface StudentDto {
  id: number;
  userId: number | null;
  username: string | null;
  studentCode: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh: string | null;
  lastNameKh: string | null;
  fullName: string;
  fullNameKh: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  nationalId: string | null;
  phoneNumber: string | null;
  email: string | null;
  currentAddress: string | null;
  province: string | null;
  profilePhoto: string | null;
  enrolledDate: string | null;
  status: StudentStatus;
  notes: string | null;
  currentEnrollment: {
    enrollmentId: number;
    classId: number;
    className: string;
    gradeLevelId: number;
    gradeLevelName: string;
    academicYearId: number;
    academicYearName: string;
  } | null;
  parentCount: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStudentInput {
  studentCode?: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh?: string | null;
  lastNameKh?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  placeOfBirth?: string | null;
  nationalId?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  currentAddress?: string | null;
  province?: string | null;
  profilePhoto?: string | null;
  enrolledDate?: string | null;
  status?: StudentStatus;
  notes?: string | null;
  /** Optionally enroll the new student straight away. */
  enrollment?: {
    academicYearId: number;
    classId: number;
    rollNumber?: string | null;
    enrolledDate?: string;
  };
  /** Optionally link existing guardians while creating the student. */
  parents?: {
    parentId: number;
    relationship?: GuardianRelationship;
    isPrimaryContact?: boolean;
    isEmergencyContact?: boolean;
  }[];
  /** Optionally create a login account for the student. */
  account?: {
    username: string;
    email: string;
    password: string;
  };
}

export type UpdateStudentInput = Omit<
  Partial<CreateStudentInput>,
  'enrollment' | 'parents' | 'account'
>;

export interface StudentFilters {
  search?: string;
  status?: StudentStatus;
  gradeLevelId?: number;
  classId?: number;
  academicYearId?: number;
  parentId?: number;
  gender?: Gender;
  includeArchived?: boolean;
}

export interface StudentParentRow {
  link_id: number;
  parent_id: number;
  parent_code: string;
  first_name_en: string;
  last_name_en: string;
  first_name_kh: string | null;
  last_name_kh: string | null;
  phone_number: string | null;
  email: string | null;
  occupation: string | null;
  profile_photo: string | null;
  relationship: GuardianRelationship;
  is_primary_contact: boolean;
  is_emergency_contact: boolean;
  can_pick_up: boolean;
}

export interface StudentParentDto {
  linkId: number;
  parentId: number;
  parentCode: string;
  fullName: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh: string | null;
  lastNameKh: string | null;
  phoneNumber: string | null;
  email: string | null;
  occupation: string | null;
  profilePhoto: string | null;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
  isEmergencyContact: boolean;
  canPickUp: boolean;
}

export interface StudentEnrollmentHistoryRow {
  id: number;
  academic_year_id: number;
  academic_year_name: string;
  academic_year_start: string;
  class_id: number;
  class_name: string;
  grade_level_id: number;
  grade_level_name: string;
  grade_level_order: number;
  homeroom_teacher_name: string | null;
  roll_number: string | null;
  enrolled_date: string;
  end_date: string | null;
  status: EnrollmentStatus;
  remarks: string | null;
}

export interface StudentEnrollmentHistoryDto {
  id: number;
  academicYearId: number;
  academicYearName: string;
  classId: number;
  className: string;
  gradeLevelId: number;
  gradeLevelName: string;
  homeroomTeacherName: string | null;
  rollNumber: string | null;
  enrolledDate: string;
  endDate: string | null;
  status: EnrollmentStatus;
  remarks: string | null;
}
