/**
 * Domain enumerations shared by validation schemas, services and the database.
 * Every value here has a matching PostgreSQL enum created by the migrations.
 */

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ROLE_CODES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PRINCIPAL',
  'TEACHER',
  'HOMEROOM_TEACHER',
  'PARENT',
  'STUDENT',
  'ACCOUNTANT',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];

export const STUDENT_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'TRANSFERRED',
  'GRADUATED',
  'WITHDRAWN',
] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const STAFF_STATUSES = ['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const ACADEMIC_YEAR_STATUSES = ['UPCOMING', 'ACTIVE', 'CLOSED'] as const;
export type AcademicYearStatus = (typeof ACADEMIC_YEAR_STATUSES)[number];

export const ENROLLMENT_STATUSES = [
  'ACTIVE',
  'COMPLETED',
  'TRANSFERRED',
  'WITHDRAWN',
  'PROMOTED',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const GUARDIAN_RELATIONSHIPS = [
  'FATHER',
  'MOTHER',
  'GRANDFATHER',
  'GRANDMOTHER',
  'UNCLE',
  'AUNT',
  'SIBLING',
  'LEGAL_GUARDIAN',
  'OTHER',
] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

export const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'LEAVE'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ASSESSMENT_TYPES = [
  'HOMEWORK',
  'QUIZ',
  'ASSIGNMENT',
  'PROJECT',
  'MIDTERM',
  'FINAL',
  'PARTICIPATION',
] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const EXAM_TYPES = ['QUIZ', 'MONTHLY_TEST', 'MIDTERM', 'FINAL'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const PERFORMANCE_LEVELS = [
  'EXCELLENT',
  'GOOD',
  'FAIR',
  'NEEDS_IMPROVEMENT',
] as const;
export type PerformanceLevel = (typeof PERFORMANCE_LEVELS)[number];

export const LETTER_GRADES = ['A', 'B', 'C', 'D', 'F'] as const;
export type LetterGrade = (typeof LETTER_GRADES)[number];

export const BEHAVIOR_TYPES = [
  'ACHIEVEMENT',
  'POSITIVE',
  'PARTICIPATION',
  'TEAMWORK',
  'RESPONSIBILITY',
  'COMMUNICATION',
  'WARNING',
  'DISCIPLINARY',
] as const;
export type BehaviorType = (typeof BEHAVIOR_TYPES)[number];

export const ANNOUNCEMENT_AUDIENCES = [
  'ALL',
  'TEACHERS',
  'PARENTS',
  'STUDENTS',
  'GRADE',
  'CLASS',
] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'ANNOUNCEMENT',
  'ATTENDANCE_ALERT',
  'NEW_ASSIGNMENT',
  'NEW_GRADE',
  'UPCOMING_EXAM',
  'PAYMENT_REMINDER',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ASSIGNMENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const SUBMISSION_STATUSES = ['PENDING', 'SUBMITTED', 'LATE', 'GRADED', 'MISSING'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const REPORT_CARD_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ReportCardStatus = (typeof REPORT_CARD_STATUSES)[number];

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'ARCHIVE',
  'RESTORE',
  'LOGIN',
  'LOGOUT',
  'PASSWORD_RESET',
  'PUBLISH',
  'ASSIGN',
  'UNASSIGN',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
