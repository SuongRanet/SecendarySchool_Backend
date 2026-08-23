import type { Weekday } from '../../types';

export interface ScheduleRow {
  id: number;
  academic_year_id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  room_id: number | null;
  day_of_week: Weekday;
  period_number: number | null;
  start_time: string;
  end_time: string;
  effective_from: string | null;
  effective_to: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  class_name?: string;
  class_code?: string;
  grade_level_name?: string;
  subject_name?: string;
  subject_code?: string;
  teacher_name?: string | null;
  room_name?: string | null;
  academic_year_name?: string;
  academic_year_status?: string;
}

export interface ScheduleDto {
  id: number;
  academicYearId: number;
  academicYearName: string;
  classId: number;
  className: string;
  classCode: string;
  gradeLevelName: string;
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  teacherId: number | null;
  teacherName: string | null;
  roomId: number | null;
  roomName: string | null;
  dayOfWeek: Weekday;
  periodNumber: number | null;
  startTime: string;
  endTime: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface CreateScheduleInput {
  academicYearId?: number;
  classId: number;
  subjectId: number;
  teacherId?: number | null;
  roomId?: number | null;
  dayOfWeek: Weekday;
  periodNumber?: number | null;
  startTime: string;
  endTime: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  notes?: string | null;
  isActive?: boolean;
  /** Saves the entry even when a conflict is only a warning. */
  ignoreWarnings?: boolean;
}

export type UpdateScheduleInput = Partial<Omit<CreateScheduleInput, 'academicYearId'>>;

export interface ScheduleFilters {
  academicYearId?: number;
  classId?: number;
  teacherId?: number;
  roomId?: number;
  subjectId?: number;
  dayOfWeek?: Weekday;
  studentId?: number;
  isActive?: boolean;
}

export type ConflictKind = 'TEACHER' | 'CLASS' | 'ROOM';

export interface ScheduleConflict {
  kind: ConflictKind;
  scheduleId: number;
  dayOfWeek: Weekday;
  startTime: string;
  endTime: string;
  className: string;
  subjectName: string;
  teacherName: string | null;
  roomName: string | null;
  message: string;
}
