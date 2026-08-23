/**
 * The Grade 9 national examination (Diplôme).
 *
 * The school registers candidates and stores the result the Ministry publishes;
 * it never marks the paper. That is why these types are separate from the
 * school's own `exams` — the data has a different owner and a different
 * lifecycle, and a published result may not be edited in place.
 */

export type NationalExamRegStatus =
  | 'NOT_REGISTERED'
  | 'REGISTERED'
  | 'ADMITTED'
  | 'SAT'
  | 'ABSENT'
  | 'RESULT_PUBLISHED';

export type NationalExamGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface NationalExamSessionRow {
  id: number;
  academic_year_id: number;
  name: string;
  centre_name: string | null;
  centre_code: string | null;
  starts_on: string;
  ends_on: string;
  registration_deadline: string | null;
  is_open: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  academic_year_name?: string;
  registered_count?: number;
  result_count?: number;
  pass_count?: number;
}

export interface NationalExamRegistrationRow {
  id: number;
  session_id: number;
  student_id: number;
  enrollment_id: number;
  seat_number: string | null;
  attempt: number;
  status: NationalExamRegStatus;
  remarks: string | null;
  registered_by: number | null;
  created_at: Date;
  updated_at: Date;
  student_code?: string;
  student_name?: string;
  student_name_kh?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  class_id?: number;
  class_name?: string;
  grade_level_code?: string;
  session_name?: string;
  centre_name?: string | null;
  starts_on?: string;
  ends_on?: string;
  academic_year_id?: number;
  academic_year_name?: string;
  result_grade?: NationalExamGrade | null;
  total_score?: number | null;
  is_pass?: boolean | null;
  published_on?: string | null;
}

export interface NationalExamResultRow {
  id: number;
  registration_id: number;
  result_grade: NationalExamGrade;
  total_score: number | null;
  is_pass: boolean;
  published_on: string;
  published_by: number | null;
  amendment_reason: string | null;
  superseded_at: Date | null;
  superseded_by: number | null;
  created_at: Date;
}

export interface NationalExamSubjectScoreRow {
  id: number;
  result_id: number;
  subject_id: number;
  score: number;
  max_score: number;
  subject_code?: string;
  subject_name?: string;
  subject_name_kh?: string | null;
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface NationalExamSessionDto {
  id: number;
  academicYearId: number;
  academicYearName: string | null;
  name: string;
  centreName: string | null;
  centreCode: string | null;
  startsOn: string;
  endsOn: string;
  registrationDeadline: string | null;
  isOpen: boolean;
  notes: string | null;
  registeredCount: number;
  resultCount: number;
  passCount: number;
  /** Percentage of published results that are a pass, or null when none are published. */
  passRate: number | null;
}

export interface NationalExamSubjectScoreDto {
  subjectId: number;
  subjectCode: string | null;
  subjectName: string | null;
  subjectNameKh: string | null;
  score: number;
  maxScore: number;
}

export interface NationalExamResultDto {
  id: number;
  registrationId: number;
  resultGrade: NationalExamGrade;
  totalScore: number | null;
  isPass: boolean;
  publishedOn: string;
  amendmentReason: string | null;
  /** A superseded result is kept for the record; only one result is live. */
  supersededAt: string | null;
  subjectScores: NationalExamSubjectScoreDto[];
}

export interface NationalExamRegistrationDto {
  id: number;
  sessionId: number;
  sessionName: string | null;
  centreName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  academicYearId: number | null;
  academicYearName: string | null;
  studentId: number;
  studentCode: string | null;
  studentName: string | null;
  studentNameKh: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  enrollmentId: number;
  classId: number | null;
  className: string | null;
  seatNumber: string | null;
  attempt: number;
  status: NationalExamRegStatus;
  remarks: string | null;
  result: {
    resultGrade: NationalExamGrade;
    totalScore: number | null;
    isPass: boolean;
    publishedOn: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateSessionInput {
  academicYearId: number;
  name: string;
  centreName?: string | null;
  centreCode?: string | null;
  startsOn: string;
  endsOn: string;
  registrationDeadline?: string | null;
  notes?: string | null;
}

export interface UpdateSessionInput {
  name?: string;
  centreName?: string | null;
  centreCode?: string | null;
  startsOn?: string;
  endsOn?: string;
  registrationDeadline?: string | null;
  isOpen?: boolean;
  notes?: string | null;
}

export interface RegisterCandidateInput {
  studentId: number;
  seatNumber?: string | null;
  remarks?: string | null;
}

export interface PublishResultInput {
  resultGrade: NationalExamGrade;
  totalScore?: number | null;
  isPass?: boolean;
  publishedOn?: string;
  subjectScores?: { subjectId: number; score: number; maxScore?: number }[];
}

export interface AmendResultInput extends PublishResultInput {
  reason: string;
}

export interface RegistrationFilters {
  sessionId?: number;
  studentId?: number;
  classId?: number;
  status?: NationalExamRegStatus;
  search?: string;
}

export interface SessionStatisticsDto {
  sessionId: number;
  registered: number;
  sat: number;
  absent: number;
  published: number;
  passed: number;
  failed: number;
  passRate: number | null;
  byClass: {
    classId: number;
    className: string;
    registered: number;
    published: number;
    passed: number;
    passRate: number | null;
  }[];
  byGrade: { resultGrade: NationalExamGrade; count: number }[];
}
