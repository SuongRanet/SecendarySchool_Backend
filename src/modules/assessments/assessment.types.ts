import type { AssessmentType } from '../../types';

export interface AssessmentRow {
  id: number;
  academic_year_id: number;
  term_id: number | null;
  class_id: number;
  subject_id: number;
  class_subject_id: number | null;
  teacher_id: number | null;
  title: string;
  description: string | null;
  type: AssessmentType;
  max_score: number;
  weight_percent: number | null;
  assessment_date: string | null;
  is_published: boolean;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  class_name?: string;
  subject_name?: string;
  teacher_name?: string | null;
  term_name?: string | null;
  academic_year_name?: string;
  academic_year_status?: string;
  graded_count?: number;
  student_count?: number;
  average_score?: number | null;
}

export interface AssessmentDto {
  id: number;
  academicYearId: number;
  academicYearName: string;
  termId: number | null;
  termName: string | null;
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
  teacherId: number | null;
  teacherName: string | null;
  title: string;
  description: string | null;
  type: AssessmentType;
  maxScore: number;
  weightPercent: number | null;
  assessmentDate: string | null;
  isPublished: boolean;
  gradedCount: number;
  studentCount: number;
  averageScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAssessmentInput {
  classId: number;
  subjectId: number;
  termId?: number | null;
  teacherId?: number | null;
  title: string;
  description?: string | null;
  type: AssessmentType;
  maxScore: number;
  weightPercent?: number | null;
  assessmentDate?: string | null;
  isPublished?: boolean;
}

export type UpdateAssessmentInput = Partial<Omit<CreateAssessmentInput, 'classId' | 'subjectId'>>;

export interface AssessmentFilters {
  search?: string;
  academicYearId?: number;
  termId?: number;
  classId?: number;
  subjectId?: number;
  teacherId?: number;
  type?: AssessmentType;
  isPublished?: boolean;
}

export interface AssessmentResultRow {
  id: number;
  assessment_id: number;
  student_id: number;
  enrollment_id: number | null;
  score: number | null;
  is_absent: boolean;
  feedback: string | null;
  graded_by: number | null;
  graded_at: Date | null;
  student_code?: string;
  first_name_en?: string;
  last_name_en?: string;
  first_name_kh?: string | null;
  last_name_kh?: string | null;
  profile_photo?: string | null;
  roll_number?: string | null;
}

export interface AssessmentResultDto {
  id: number | null;
  assessmentId: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  studentNameKh: string | null;
  profilePhoto: string | null;
  rollNumber: string | null;
  score: number | null;
  percentage: number | null;
  isAbsent: boolean;
  feedback: string | null;
  gradedAt: Date | null;
}

export interface SaveResultsInput {
  results: {
    studentId: number;
    score?: number | null;
    isAbsent?: boolean;
    feedback?: string | null;
  }[];
}

export interface AssessmentStatistics {
  assessmentId: number;
  maxScore: number;
  gradedCount: number;
  studentCount: number;
  averageScore: number | null;
  averagePercent: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  passCount: number;
  failCount: number;
  absentCount: number;
}
