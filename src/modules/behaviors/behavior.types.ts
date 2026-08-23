import type { BehaviorType } from '../../types';

export interface BehaviorRow {
  id: number;
  student_id: number;
  academic_year_id: number;
  class_id: number | null;
  teacher_id: number | null;
  type: BehaviorType;
  title: string;
  description: string | null;
  occurred_on: string;
  points: number;
  action_taken: string | null;
  visible_to_parent: boolean;
  recorded_by: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  student_code?: string;
  student_first_name?: string;
  student_last_name?: string;
  class_name?: string | null;
  teacher_name?: string | null;
}

export interface BehaviorDto {
  id: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  academicYearId: number;
  classId: number | null;
  className: string | null;
  teacherId: number | null;
  teacherName: string | null;
  type: BehaviorType;
  title: string;
  description: string | null;
  occurredOn: string;
  points: number;
  actionTaken: string | null;
  visibleToParent: boolean;
  createdAt: Date;
}

export interface CreateBehaviorInput {
  studentId: number;
  classId?: number | null;
  type: BehaviorType;
  title: string;
  description?: string | null;
  occurredOn?: string;
  points?: number;
  actionTaken?: string | null;
  visibleToParent?: boolean;
}

export type UpdateBehaviorInput = Partial<Omit<CreateBehaviorInput, 'studentId'>>;

export interface BehaviorFilters {
  search?: string;
  studentId?: number;
  classId?: number;
  academicYearId?: number;
  type?: BehaviorType;
  dateFrom?: string;
  dateTo?: string;
  visibleToParentOnly?: boolean;
}

export interface StudentCommentRow {
  id: number;
  student_id: number;
  academic_year_id: number;
  term_id: number | null;
  class_id: number | null;
  subject_id: number | null;
  teacher_id: number | null;
  is_homeroom: boolean;
  comment: string;
  visible_to_parent: boolean;
  created_at: Date;
  teacher_name?: string | null;
  subject_name?: string | null;
  term_name?: string | null;
}

export interface StudentCommentDto {
  id: number;
  studentId: number;
  academicYearId: number;
  termId: number | null;
  termName: string | null;
  classId: number | null;
  subjectId: number | null;
  subjectName: string | null;
  teacherId: number | null;
  teacherName: string | null;
  isHomeroom: boolean;
  comment: string;
  visibleToParent: boolean;
  createdAt: Date;
}

export interface CreateCommentInput {
  studentId: number;
  termId?: number | null;
  classId?: number | null;
  subjectId?: number | null;
  isHomeroom?: boolean;
  comment: string;
  visibleToParent?: boolean;
}

export interface BehaviorSummary {
  positive: number;
  warnings: number;
  disciplinary: number;
  totalPoints: number;
  byType: { type: BehaviorType; count: number }[];
}
