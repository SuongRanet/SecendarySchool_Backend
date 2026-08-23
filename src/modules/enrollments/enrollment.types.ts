import type { EnrollmentStatus } from '../../types';

export interface EnrollmentRow {
  id: number;
  student_id: number;
  academic_year_id: number;
  class_id: number;
  roll_number: string | null;
  enrolled_date: string;
  end_date: string | null;
  status: EnrollmentStatus;
  transferred_from: number | null;
  remarks: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  student_code?: string;
  student_first_name?: string;
  student_last_name?: string;
  student_photo?: string | null;
  class_name?: string;
  class_code?: string;
  grade_level_id?: number;
  grade_level_name?: string;
  academic_year_name?: string;
  academic_year_status?: string;
}

export interface EnrollmentDto {
  id: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  studentPhoto: string | null;
  academicYearId: number;
  academicYearName: string;
  classId: number;
  className: string;
  classCode: string;
  gradeLevelId: number;
  gradeLevelName: string;
  rollNumber: string | null;
  enrolledDate: string;
  endDate: string | null;
  status: EnrollmentStatus;
  transferredFrom: number | null;
  remarks: string | null;
  createdAt: Date;
}

export interface CreateEnrollmentInput {
  studentId: number;
  academicYearId: number;
  classId: number;
  rollNumber?: string | null;
  enrolledDate?: string | null;
  remarks?: string | null;
}

export interface TransferEnrollmentInput {
  classId: number;
  effectiveDate?: string;
  rollNumber?: string | null;
  remarks?: string | null;
}

export interface WithdrawEnrollmentInput {
  endDate?: string | null;
  status?: Extract<EnrollmentStatus, 'WITHDRAWN' | 'TRANSFERRED' | 'COMPLETED'>;
  remarks?: string | null;
  /** Also updates the student record so lists reflect the change. */
  updateStudentStatus?: boolean;
}

export interface PromotionInput {
  fromAcademicYearId: number;
  toAcademicYearId: number;
  /** Explicit class mapping: students of `fromClassId` move to `toClassId`. */
  classMapping: { fromClassId: number; toClassId: number }[];
  /** Students to leave behind; their previous enrollment is completed but not promoted. */
  excludeStudentIds?: number[];
  enrolledDate?: string | null;
}

export interface PromotionResult {
  promoted: number;
  skipped: number;
  details: { studentId: number; fromClassId: number; toClassId: number; enrollmentId: number }[];
}

export interface EnrollmentFilters {
  search?: string;
  academicYearId?: number;
  classId?: number;
  gradeLevelId?: number;
  studentId?: number;
  status?: EnrollmentStatus;
}
