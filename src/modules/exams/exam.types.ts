import type { ExamType } from '../../types';

export interface ExamRow {
  id: number;
  academic_year_id: number;
  term_id: number | null;
  class_id: number;
  subject_id: number;
  room_id: number | null;
  title: string;
  type: ExamType;
  exam_date: string;
  start_time: string | null;
  duration_minutes: number | null;
  max_score: number;
  instructions: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  class_name?: string;
  subject_name?: string;
  room_name?: string | null;
  term_name?: string | null;
  academic_year_name?: string;
  academic_year_status?: string;
  graded_count?: number;
  student_count?: number;
  average_score?: number | null;
}

export interface ExamDto {
  id: number;
  academicYearId: number;
  academicYearName: string;
  termId: number | null;
  termName: string | null;
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
  roomId: number | null;
  roomName: string | null;
  title: string;
  type: ExamType;
  examDate: string;
  startTime: string | null;
  durationMinutes: number | null;
  maxScore: number;
  instructions: string | null;
  gradedCount: number;
  studentCount: number;
  averageScore: number | null;
  createdAt: Date;
}

export interface CreateExamInput {
  classId: number;
  subjectId: number;
  termId?: number | null;
  roomId?: number | null;
  title: string;
  type: ExamType;
  examDate: string;
  startTime?: string | null;
  durationMinutes?: number | null;
  maxScore: number;
  instructions?: string | null;
}

export type UpdateExamInput = Partial<Omit<CreateExamInput, 'classId' | 'subjectId'>>;

export interface ExamFilters {
  search?: string;
  academicYearId?: number;
  termId?: number;
  classId?: number;
  subjectId?: number;
  type?: ExamType;
  dateFrom?: string;
  dateTo?: string;
  upcomingOnly?: boolean;
}

export interface ExamResultRow {
  id: number | null;
  exam_id: number;
  student_id: number;
  score: number | null;
  is_absent: boolean;
  remark: string | null;
  graded_at: Date | null;
  student_code?: string;
  first_name_en?: string;
  last_name_en?: string;
  roll_number?: string | null;
}

export interface ExamResultDto {
  id: number | null;
  examId: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  rollNumber: string | null;
  score: number | null;
  percentage: number | null;
  isAbsent: boolean;
  remark: string | null;
  gradedAt: Date | null;
}
