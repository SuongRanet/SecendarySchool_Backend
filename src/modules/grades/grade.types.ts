import type { AssessmentType, PerformanceLevel } from '../../types';

export interface GradingSchemeRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface GradingComponentRow {
  id: number;
  grading_scheme_id: number;
  assessment_type: AssessmentType;
  weight_percent: number;
}

export interface GradeScaleRow {
  id: number;
  grading_scheme_id: number;
  letter_grade: string;
  min_score: number;
  max_score: number;
  gpa_point: number | null;
  performance: PerformanceLevel;
  remark_en: string | null;
  remark_kh: string | null;
}

export interface GradingSchemeDto {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  components: { assessmentType: AssessmentType; weightPercent: number }[];
  scales: {
    letterGrade: string;
    minScore: number;
    maxScore: number;
    gpaPoint: number | null;
    performance: PerformanceLevel;
    remark: string | null;
  }[];
}

export interface GradeRow {
  id: number;
  student_id: number;
  enrollment_id: number | null;
  academic_year_id: number;
  term_id: number | null;
  class_id: number;
  subject_id: number;
  grading_scheme_id: number | null;
  score: number | null;
  max_score: number;
  percentage: number | null;
  letter_grade: string | null;
  performance: PerformanceLevel | null;
  gpa_point: number | null;
  rank_in_class: number | null;
  teacher_comment: string | null;
  is_final: boolean;
  calculated_at: Date | null;
  recorded_by: number | null;
  created_at: Date;
  updated_at: Date;
  student_code?: string;
  student_first_name?: string;
  student_last_name?: string;
  subject_name?: string;
  class_name?: string;
  term_name?: string | null;
  academic_year_name?: string;
  academic_year_status?: string;
}

export interface GradeDto {
  id: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  academicYearId: number;
  academicYearName: string;
  termId: number | null;
  termName: string | null;
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
  score: number | null;
  maxScore: number;
  percentage: number | null;
  letterGrade: string | null;
  performance: PerformanceLevel | null;
  gpaPoint: number | null;
  rankInClass: number | null;
  teacherComment: string | null;
  isFinal: boolean;
  calculatedAt: Date | null;
  updatedAt: Date;
}

export interface SaveGradeInput {
  studentId: number;
  classId: number;
  subjectId: number;
  termId?: number | null;
  score?: number | null;
  maxScore?: number;
  teacherComment?: string | null;
  isFinal?: boolean;
  /** Why the score changed; stored in the grade history trail. */
  reason?: string | null;
}

export interface GradeFilters {
  academicYearId?: number;
  termId?: number;
  classId?: number;
  subjectId?: number;
  studentId?: number;
  isFinal?: boolean;
}

export interface GradeHistoryEntry {
  id: number;
  gradeId: number;
  oldScore: number | null;
  newScore: number | null;
  oldLetter: string | null;
  newLetter: string | null;
  reason: string | null;
  changedBy: number | null;
  changedByName: string | null;
  createdAt: Date;
}

export interface CalculatedGrade {
  studentId: number;
  studentCode: string;
  studentName: string;
  componentBreakdown: {
    assessmentType: AssessmentType;
    weightPercent: number;
    earned: number;
    possible: number;
    percent: number | null;
    weighted: number | null;
  }[];
  percentage: number | null;
  letterGrade: string | null;
  performance: PerformanceLevel | null;
  gpaPoint: number | null;
}
