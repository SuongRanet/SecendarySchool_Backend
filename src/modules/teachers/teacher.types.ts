import type { Gender, StaffStatus, Weekday } from '../../types';

export interface TeacherRow {
  id: number;
  user_id: number | null;
  teacher_code: string;
  first_name_en: string;
  last_name_en: string;
  first_name_kh: string | null;
  last_name_kh: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  national_id: string | null;
  phone_number: string | null;
  email: string | null;
  address: string | null;
  qualification: string | null;
  specialization: string | null;
  hire_date: string | null;
  status: StaffStatus;
  profile_photo: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  username?: string | null;
  subject_ids?: number[] | null;
  homeroom_class_ids?: number[] | null;
  class_count?: number;
  student_count?: number;
}

export interface TeacherDto {
  id: number;
  userId: number | null;
  username: string | null;
  teacherCode: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh: string | null;
  lastNameKh: string | null;
  fullName: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  phoneNumber: string | null;
  email: string | null;
  address: string | null;
  qualification: string | null;
  specialization: string | null;
  hireDate: string | null;
  status: StaffStatus;
  profilePhoto: string | null;
  notes: string | null;
  subjectIds: number[];
  homeroomClassIds: number[];
  classCount: number;
  studentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTeacherInput {
  teacherCode?: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameKh?: string | null;
  lastNameKh?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  nationalId?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  address?: string | null;
  qualification?: string | null;
  specialization?: string | null;
  hireDate?: string | null;
  status?: StaffStatus;
  profilePhoto?: string | null;
  notes?: string | null;
  subjectIds?: number[];
  /** When present, an account is created and linked to the new teacher. */
  account?: {
    username: string;
    email: string;
    password: string;
    isHomeroomTeacher?: boolean;
  };
}

export type UpdateTeacherInput = Omit<Partial<CreateTeacherInput>, 'account'>;

export interface TeacherFilters {
  search?: string;
  status?: StaffStatus;
  subjectId?: number;
  classId?: number;
  hasAccount?: boolean;
}

export interface TeacherAssignmentRow {
  class_subject_id: number;
  class_id: number;
  class_name: string;
  class_code: string;
  academic_year_id: number;
  academic_year_name: string;
  grade_level_id: number;
  grade_level_name: string;
  subject_id: number;
  subject_name: string;
  is_homeroom: boolean;
  student_count: number;
}

export interface TeacherAssignmentDto {
  classSubjectId: number;
  classId: number;
  className: string;
  classCode: string;
  academicYearId: number;
  academicYearName: string;
  gradeLevelId: number;
  gradeLevelName: string;
  subjectId: number;
  subjectName: string;
  isHomeroom: boolean;
  studentCount: number;
}

export interface TeacherScheduleRow {
  id: number;
  day_of_week: Weekday;
  period_number: number | null;
  start_time: string;
  end_time: string;
  class_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  room_id: number | null;
  room_name: string | null;
  academic_year_id: number;
}

export interface TeacherScheduleDto {
  id: number;
  dayOfWeek: Weekday;
  periodNumber: number | null;
  startTime: string;
  endTime: string;
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
  roomId: number | null;
  roomName: string | null;
  academicYearId: number;
}
