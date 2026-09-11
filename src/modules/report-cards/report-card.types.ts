import type { PerformanceLevel, ReportCardStatus } from '../../types';

export interface ReportCardRow {
  id: number;
  student_id: number;
  enrollment_id: number | null;
  academic_year_id: number;
  term_id: number | null;
  class_id: number;
  total_score: number | null;
  average_score: number | null;
  gpa: number | null;
  letter_grade: string | null;
  performance: PerformanceLevel | null;
  rank_in_class: number | null;
  class_size: number | null;
  days_present: number;
  days_absent: number;
  days_late: number;
  days_excused: number;
  attendance_percent: number | null;
  teacher_comment: string | null;
  homeroom_comment: string | null;
  principal_comment: string | null;
  status: ReportCardStatus;
  generated_by: number | null;
  generated_at: Date | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  student_code?: string;
  student_first_name?: string;
  student_last_name?: string;
  student_first_name_kh?: string | null;
  student_last_name_kh?: string | null;
  student_photo?: string | null;
  date_of_birth?: string | null;
  class_name?: string;
  grade_level_name?: string;
  homeroom_teacher_id?: number | null;
  homeroom_teacher_name?: string | null;
  academic_year_name?: string;
  term_name?: string | null;
}

export interface ReportCardSubjectRow {
  id: number;
  report_card_id: number;
  subject_id: number;
  grade_id: number | null;
  score: number | null;
  max_score: number;
  percentage: number | null;
  letter_grade: string | null;
  performance: PerformanceLevel | null;
  rank_in_class: number | null;
  comment: string | null;
  display_order: number;
  subject_name?: string;
  subject_name_kh?: string | null;
  subject_code?: string;
}

export interface ReportCardSubjectDto {
  subjectId: number;
  subjectName: string;
  subjectNameKh: string | null;
  subjectCode: string;
  score: number | null;
  maxScore: number;
  percentage: number | null;
  letterGrade: string | null;
  performance: PerformanceLevel | null;
  rankInClass: number | null;
  comment: string | null;
}

export interface ReportCardDto {
  id: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  studentNameKh: string | null;
  studentPhoto: string | null;
  dateOfBirth: string | null;
  academicYearId: number;
  academicYearName: string;
  termId: number | null;
  termName: string | null;
  classId: number;
  className: string;
  gradeLevelName: string;
  homeroomTeacherId: number | null;
  homeroomTeacherName: string | null;
  totalScore: number | null;
  averageScore: number | null;
  gpa: number | null;
  letterGrade: string | null;
  performance: PerformanceLevel | null;
  rankInClass: number | null;
  classSize: number | null;
  attendance: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    percent: number | null;
  };
  teacherComment: string | null;
  homeroomComment: string | null;
  principalComment: string | null;
  status: ReportCardStatus;
  generatedAt: Date | null;
  publishedAt: Date | null;
  subjects: ReportCardSubjectDto[];
}

export interface GenerateReportCardsInput {
  classId: number;
  termId?: number | null;
  /** Restrict generation to specific students; otherwise the whole class. */
  studentIds?: number[];
  publish?: boolean;
}

export interface UpdateReportCardInput {
  teacherComment?: string | null;
  homeroomComment?: string | null;
  principalComment?: string | null;
  subjectComments?: { subjectId: number; comment?: string | null }[];
}

export interface ReportCardFilters {
  /**
   * Restricts the list to the children of one guardian. Set from the token for
   * a parent, never from the query string.
   */
  parentId?: number;
  academicYearId?: number;
  termId?: number;
  classId?: number;
  studentId?: number;
  status?: ReportCardStatus;
}
