import type { AssignmentStatus, SubmissionStatus } from '../../types';

export interface AssignmentRow {
  id: number;
  academic_year_id: number;
  term_id: number | null;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  assessment_id: number | null;
  title: string;
  description: string | null;
  instructions: string | null;
  attachment_url: string | null;
  assigned_date: string;
  due_date: string;
  max_score: number | null;
  status: AssignmentStatus;
  published_at: Date | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  class_name?: string;
  subject_name?: string;
  teacher_name?: string | null;
  submission_count?: number;
  student_count?: number;
  graded_count?: number;
  /** Present when the list is queried for one student. */
  submission_status?: SubmissionStatus | null;
  submission_score?: number | null;
  submission_feedback?: string | null;
}

export interface AssignmentDto {
  id: number;
  academicYearId: number;
  termId: number | null;
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
  teacherId: number | null;
  teacherName: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  attachmentUrl: string | null;
  assignedDate: string;
  dueDate: string;
  maxScore: number | null;
  status: AssignmentStatus;
  isOverdue: boolean;
  submissionCount: number;
  studentCount: number;
  gradedCount: number;
  /** Only present when the assignment was loaded for a specific student. */
  mySubmission: {
    status: SubmissionStatus;
    score: number | null;
    feedback: string | null;
  } | null;
  createdAt: Date;
}

export interface CreateAssignmentInput {
  classId: number;
  subjectId: number;
  termId?: number | null;
  title: string;
  description?: string | null;
  instructions?: string | null;
  attachmentUrl?: string | null;
  assignedDate?: string;
  dueDate: string;
  maxScore?: number | null;
  publishNow?: boolean;
}

export type UpdateAssignmentInput = Partial<
  Omit<CreateAssignmentInput, 'classId' | 'subjectId' | 'publishNow'>
>;

export interface AssignmentFilters {
  search?: string;
  academicYearId?: number;
  classId?: number;
  subjectId?: number;
  teacherId?: number;
  studentId?: number;
  status?: AssignmentStatus;
  dueFrom?: string;
  dueTo?: string;
  pendingOnly?: boolean;
}

export interface SubmissionRow {
  id: number | null;
  assignment_id: number;
  student_id: number;
  status: SubmissionStatus;
  content: string | null;
  attachment_url: string | null;
  submitted_at: Date | null;
  score: number | null;
  feedback: string | null;
  graded_at: Date | null;
  student_code?: string;
  first_name_en?: string;
  last_name_en?: string;
  roll_number?: string | null;
}

export interface SubmissionDto {
  id: number | null;
  assignmentId: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  rollNumber: string | null;
  status: SubmissionStatus;
  content: string | null;
  attachmentUrl: string | null;
  submittedAt: Date | null;
  score: number | null;
  feedback: string | null;
  gradedAt: Date | null;
}
