import type { AcademicYearStatus, EnrollmentStatus, Gender, StudentStatus } from '../../types';

export interface ClassRow {
  id: number;
  academic_year_id: number;
  grade_level_id: number;
  homeroom_teacher_id: number | null;
  room_id: number | null;
  code: string;
  name: string;
  capacity: number;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  academic_year_name?: string;
  academic_year_status?: AcademicYearStatus;
  grade_level_name?: string;
  grade_level_order?: number;
  homeroom_teacher_name?: string | null;
  room_name?: string | null;
  enrolled_count?: number;
  subject_count?: number;
}

export interface ClassDto {
  id: number;
  academicYearId: number;
  academicYearName: string;
  academicYearStatus: AcademicYearStatus;
  gradeLevelId: number;
  gradeLevelName: string;
  gradeLevelOrder: number;
  homeroomTeacherId: number | null;
  homeroomTeacherName: string | null;
  roomId: number | null;
  roomName: string | null;
  code: string;
  name: string;
  capacity: number;
  description: string | null;
  isActive: boolean;
  enrolledCount: number;
  availableSeats: number;
  subjectCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClassInput {
  academicYearId: number;
  gradeLevelId: number;
  code: string;
  name: string;
  homeroomTeacherId?: number | null;
  roomId?: number | null;
  capacity?: number;
  description?: string | null;
  isActive?: boolean;
  /** Subjects to create for the class right away. */
  subjects?: { subjectId: number; teacherId?: number | null; weight?: number }[];
}

export type UpdateClassInput = Omit<Partial<CreateClassInput>, 'academicYearId' | 'subjects'>;

export interface ClassFilters {
  search?: string;
  academicYearId?: number;
  gradeLevelId?: number;
  homeroomTeacherId?: number;
  teacherId?: number;
  isActive?: boolean;
}

export interface ClassSubjectRow {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  weight: number;
  is_active: boolean;
  subject_code: string;
  subject_name_en: string;
  subject_name_kh: string | null;
  teacher_name: string | null;
  assessment_count: number;
}

export interface ClassSubjectDto {
  id: number;
  classId: number;
  subjectId: number;
  subjectCode: string;
  subjectNameEn: string;
  subjectNameKh: string | null;
  teacherId: number | null;
  teacherName: string | null;
  weight: number;
  isActive: boolean;
  assessmentCount: number;
}

export interface ClassStudentRow {
  enrollment_id: number;
  student_id: number;
  student_code: string;
  first_name_en: string;
  last_name_en: string;
  first_name_kh: string | null;
  last_name_kh: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  profile_photo: string | null;
  student_status: StudentStatus;
  enrollment_status: EnrollmentStatus;
  roll_number: string | null;
  enrolled_date: string;
}

export interface ClassStudentDto {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh: string | null;
  lastNameKh: string | null;
  fullName: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  profilePhoto: string | null;
  studentStatus: StudentStatus;
  enrollmentStatus: EnrollmentStatus;
  rollNumber: string | null;
  enrolledDate: string;
}
