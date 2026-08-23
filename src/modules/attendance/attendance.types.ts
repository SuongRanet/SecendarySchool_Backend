import type { AttendanceStatus } from '../../types';

export interface AttendanceRow {
  id: number;
  student_id: number;
  class_id: number;
  enrollment_id: number | null;
  academic_year_id: number;
  schedule_id: number | null;
  subject_id: number | null;
  attendance_date: string;
  period_number: number | null;
  status: AttendanceStatus;
  reason_id: number | null;
  note: string | null;
  minutes_late: number | null;
  recorded_by: number | null;
  updated_by: number | null;
  created_at: Date;
  updated_at: Date;
  student_code?: string;
  student_first_name?: string;
  student_last_name?: string;
  student_photo?: string | null;
  class_name?: string;
  subject_name?: string | null;
  reason_name?: string | null;
  recorded_by_name?: string | null;
}

export interface AttendanceDto {
  id: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  studentPhoto: string | null;
  classId: number;
  className: string;
  academicYearId: number;
  subjectId: number | null;
  subjectName: string | null;
  attendanceDate: string;
  periodNumber: number | null;
  status: AttendanceStatus;
  reasonId: number | null;
  reasonName: string | null;
  note: string | null;
  minutesLate: number | null;
  recordedBy: number | null;
  recordedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceReasonRow {
  id: number;
  code: string;
  name_en: string;
  name_kh: string | null;
  applies_to: AttendanceStatus | null;
  is_excused: boolean;
  is_active: boolean;
}

export interface AttendanceReasonDto {
  id: number;
  code: string;
  nameEn: string;
  nameKh: string | null;
  appliesTo: AttendanceStatus | null;
  isExcused: boolean;
  isActive: boolean;
}

/** One student's mark inside a bulk save. */
export interface AttendanceEntryInput {
  studentId: number;
  status: AttendanceStatus;
  reasonId?: number | null;
  note?: string | null;
  minutesLate?: number | null;
}

export interface RecordAttendanceInput {
  classId: number;
  attendanceDate: string;
  periodNumber?: number | null;
  subjectId?: number | null;
  scheduleId?: number | null;
  entries: AttendanceEntryInput[];
}

export interface AttendanceFilters {
  classId?: number;
  studentId?: number;
  academicYearId?: number;
  subjectId?: number;
  status?: AttendanceStatus;
  dateFrom?: string;
  dateTo?: string;
  periodNumber?: number | null;
}

export interface AttendanceSheetStudent {
  studentId: number;
  studentCode: string;
  fullName: string;
  fullNameKh: string | null;
  profilePhoto: string | null;
  rollNumber: string | null;
  enrollmentId: number;
  /** The existing record for this date, when attendance was already taken. */
  attendance: {
    id: number;
    status: AttendanceStatus;
    reasonId: number | null;
    note: string | null;
    minutesLate: number | null;
  } | null;
}

export interface AttendanceSheet {
  classId: number;
  className: string;
  academicYearId: number;
  attendanceDate: string;
  periodNumber: number | null;
  isRecorded: boolean;
  recordedAt: Date | null;
  students: AttendanceSheetStudent[];
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  excused: number;
  leave: number;
  totalRecords: number;
  /** Present + late, over all recorded days. */
  attendanceRate: number;
}

export interface StudentAttendanceSummary extends AttendanceSummary {
  studentId: number;
  studentCode: string;
  studentName: string;
}

export interface ClassAttendanceSummary extends AttendanceSummary {
  classId: number;
  className: string;
  studentCount: number;
}

export interface DailyAttendancePoint {
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  leave: number;
}
