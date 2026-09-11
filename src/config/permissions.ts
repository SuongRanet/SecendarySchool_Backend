import type { RoleCode } from '../types/enums';

/**
 * Every permission the backend knows about. Codes follow `module.action` so the
 * seed can group them and the frontend can reason about a module at a time.
 */
export const PERMISSIONS = {
  // Users & access control
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DISABLE: 'users.disable',
  USERS_RESET_PASSWORD: 'users.reset_password',
  USERS_ASSIGN_ROLES: 'users.assign_roles',

  ROLES_VIEW: 'roles.view',
  ROLES_MANAGE: 'roles.manage',

  // Students
  STUDENTS_VIEW: 'students.view',
  STUDENTS_VIEW_OWN: 'students.view_own',
  STUDENTS_CREATE: 'students.create',
  STUDENTS_UPDATE: 'students.update',
  STUDENTS_ARCHIVE: 'students.archive',

  // Parents
  PARENTS_VIEW: 'parents.view',
  PARENTS_CREATE: 'parents.create',
  PARENTS_UPDATE: 'parents.update',
  PARENTS_ARCHIVE: 'parents.archive',
  PARENTS_LINK_STUDENTS: 'parents.link_students',

  // Teachers
  TEACHERS_VIEW: 'teachers.view',
  TEACHERS_CREATE: 'teachers.create',
  TEACHERS_UPDATE: 'teachers.update',
  TEACHERS_ARCHIVE: 'teachers.archive',
  TEACHERS_ASSIGN: 'teachers.assign',

  // Academic structure
  ACADEMIC_YEARS_VIEW: 'academic_years.view',
  ACADEMIC_YEARS_MANAGE: 'academic_years.manage',
  ACADEMIC_YEARS_CLOSE: 'academic_years.close',

  GRADE_LEVELS_VIEW: 'grade_levels.view',
  GRADE_LEVELS_MANAGE: 'grade_levels.manage',

  CLASSES_VIEW: 'classes.view',
  CLASSES_MANAGE: 'classes.manage',

  SUBJECTS_VIEW: 'subjects.view',
  SUBJECTS_MANAGE: 'subjects.manage',

  ROOMS_VIEW: 'rooms.view',
  ROOMS_MANAGE: 'rooms.manage',

  ENROLLMENTS_VIEW: 'enrollments.view',
  ENROLLMENTS_MANAGE: 'enrollments.manage',

  // Daily operations
  SCHEDULES_VIEW: 'schedules.view',
  SCHEDULES_MANAGE: 'schedules.manage',

  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_RECORD: 'attendance.record',
  ATTENDANCE_UPDATE_ANY: 'attendance.update_any',

  // Academic performance
  ASSESSMENTS_VIEW: 'assessments.view',
  ASSESSMENTS_MANAGE: 'assessments.manage',
  ASSESSMENTS_GRADE: 'assessments.grade',

  EXAMS_VIEW: 'exams.view',
  EXAMS_MANAGE: 'exams.manage',


  GRADES_VIEW: 'grades.view',
  GRADES_ENTER: 'grades.enter',
  GRADES_UPDATE_ANY: 'grades.update_any',

  REPORT_CARDS_VIEW: 'report_cards.view',
  REPORT_CARDS_GENERATE: 'report_cards.generate',
  REPORT_CARDS_PUBLISH: 'report_cards.publish',

  // Assignments
  ASSIGNMENTS_VIEW: 'assignments.view',
  ASSIGNMENTS_MANAGE: 'assignments.manage',
  ASSIGNMENTS_GRADE: 'assignments.grade',
  ASSIGNMENTS_SUBMIT: 'assignments.submit',

  // Behavior
  BEHAVIORS_VIEW: 'behaviors.view',
  BEHAVIORS_MANAGE: 'behaviors.manage',

  // Communication
  ANNOUNCEMENTS_VIEW: 'announcements.view',
  ANNOUNCEMENTS_MANAGE: 'announcements.manage',
  ANNOUNCEMENTS_PUBLISH: 'announcements.publish',

  NOTIFICATIONS_VIEW: 'notifications.view',
  NOTIFICATIONS_SEND: 'notifications.send',

  // Insight
  DASHBOARD_ADMIN: 'dashboard.admin',
  DASHBOARD_PRINCIPAL: 'dashboard.principal',
  DASHBOARD_TEACHER: 'dashboard.teacher',
  DASHBOARD_PARENT: 'dashboard.parent',
  DASHBOARD_STUDENT: 'dashboard.student',

  REPORTS_VIEW: 'reports.view',
  AUDIT_LOGS_VIEW: 'audit_logs.view',

  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  code: PermissionCode;
  name: string;
  module: string;
}

const define = (code: PermissionCode, name: string): PermissionDefinition => ({
  code,
  name,
  module: code.split('.')[0],
});

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  define(PERMISSIONS.USERS_VIEW, 'View users'),
  define(PERMISSIONS.USERS_CREATE, 'Create users'),
  define(PERMISSIONS.USERS_UPDATE, 'Update users'),
  define(PERMISSIONS.USERS_DISABLE, 'Disable users'),
  define(PERMISSIONS.USERS_RESET_PASSWORD, 'Reset user passwords'),
  define(PERMISSIONS.USERS_ASSIGN_ROLES, 'Assign roles to users'),

  define(PERMISSIONS.ROLES_VIEW, 'View roles'),
  define(PERMISSIONS.ROLES_MANAGE, 'Manage roles and permissions'),

  define(PERMISSIONS.STUDENTS_VIEW, 'View students'),
  define(PERMISSIONS.STUDENTS_VIEW_OWN, 'View own or linked students'),
  define(PERMISSIONS.STUDENTS_CREATE, 'Create students'),
  define(PERMISSIONS.STUDENTS_UPDATE, 'Update students'),
  define(PERMISSIONS.STUDENTS_ARCHIVE, 'Archive students'),

  define(PERMISSIONS.PARENTS_VIEW, 'View parents and guardians'),
  define(PERMISSIONS.PARENTS_CREATE, 'Create parents and guardians'),
  define(PERMISSIONS.PARENTS_UPDATE, 'Update parents and guardians'),
  define(PERMISSIONS.PARENTS_ARCHIVE, 'Archive parents and guardians'),
  define(PERMISSIONS.PARENTS_LINK_STUDENTS, 'Link parents to students'),

  define(PERMISSIONS.TEACHERS_VIEW, 'View teachers'),
  define(PERMISSIONS.TEACHERS_CREATE, 'Create teachers'),
  define(PERMISSIONS.TEACHERS_UPDATE, 'Update teachers'),
  define(PERMISSIONS.TEACHERS_ARCHIVE, 'Archive teachers'),
  define(PERMISSIONS.TEACHERS_ASSIGN, 'Assign teachers to classes and subjects'),

  define(PERMISSIONS.ACADEMIC_YEARS_VIEW, 'View academic years'),
  define(PERMISSIONS.ACADEMIC_YEARS_MANAGE, 'Manage academic years'),
  define(PERMISSIONS.ACADEMIC_YEARS_CLOSE, 'Close academic years'),

  define(PERMISSIONS.GRADE_LEVELS_VIEW, 'View grade levels'),
  define(PERMISSIONS.GRADE_LEVELS_MANAGE, 'Manage grade levels'),

  define(PERMISSIONS.CLASSES_VIEW, 'View classes'),
  define(PERMISSIONS.CLASSES_MANAGE, 'Manage classes'),

  define(PERMISSIONS.SUBJECTS_VIEW, 'View subjects'),
  define(PERMISSIONS.SUBJECTS_MANAGE, 'Manage subjects'),

  define(PERMISSIONS.ROOMS_VIEW, 'View rooms'),
  define(PERMISSIONS.ROOMS_MANAGE, 'Manage rooms'),

  define(PERMISSIONS.ENROLLMENTS_VIEW, 'View enrollments'),
  define(PERMISSIONS.ENROLLMENTS_MANAGE, 'Manage enrollments'),

  define(PERMISSIONS.SCHEDULES_VIEW, 'View schedules'),
  define(PERMISSIONS.SCHEDULES_MANAGE, 'Manage schedules'),

  define(PERMISSIONS.ATTENDANCE_VIEW, 'View attendance'),
  define(PERMISSIONS.ATTENDANCE_RECORD, 'Record attendance'),
  define(PERMISSIONS.ATTENDANCE_UPDATE_ANY, 'Update attendance for any class'),

  define(PERMISSIONS.ASSESSMENTS_VIEW, 'View assessments'),
  define(PERMISSIONS.ASSESSMENTS_MANAGE, 'Manage assessments'),
  define(PERMISSIONS.ASSESSMENTS_GRADE, 'Enter assessment results'),

  define(PERMISSIONS.EXAMS_VIEW, 'View exams'),
  define(PERMISSIONS.EXAMS_MANAGE, 'Manage exams'),

  define(PERMISSIONS.GRADES_VIEW, 'View grades'),
  define(PERMISSIONS.GRADES_ENTER, 'Enter grades'),
  define(PERMISSIONS.GRADES_UPDATE_ANY, 'Update grades for any class or subject'),

  define(PERMISSIONS.REPORT_CARDS_VIEW, 'View report cards'),
  define(PERMISSIONS.REPORT_CARDS_GENERATE, 'Generate report cards'),
  define(PERMISSIONS.REPORT_CARDS_PUBLISH, 'Publish report cards'),

  define(PERMISSIONS.ASSIGNMENTS_VIEW, 'View assignments'),
  define(PERMISSIONS.ASSIGNMENTS_MANAGE, 'Manage assignments'),
  define(PERMISSIONS.ASSIGNMENTS_GRADE, 'Grade assignment submissions'),
  define(PERMISSIONS.ASSIGNMENTS_SUBMIT, 'Submit own homework'),

  define(PERMISSIONS.BEHAVIORS_VIEW, 'View behavior records'),
  define(PERMISSIONS.BEHAVIORS_MANAGE, 'Manage behavior records'),

  define(PERMISSIONS.ANNOUNCEMENTS_VIEW, 'View announcements'),
  define(PERMISSIONS.ANNOUNCEMENTS_MANAGE, 'Manage announcements'),
  define(PERMISSIONS.ANNOUNCEMENTS_PUBLISH, 'Publish announcements'),

  define(PERMISSIONS.NOTIFICATIONS_VIEW, 'View notifications'),
  define(PERMISSIONS.NOTIFICATIONS_SEND, 'Send notifications'),

  define(PERMISSIONS.DASHBOARD_ADMIN, 'View the administrator dashboard'),
  define(PERMISSIONS.DASHBOARD_PRINCIPAL, 'View the principal dashboard'),
  define(PERMISSIONS.DASHBOARD_TEACHER, 'View the teacher dashboard'),
  define(PERMISSIONS.DASHBOARD_PARENT, 'View the parent dashboard'),
  define(PERMISSIONS.DASHBOARD_STUDENT, 'View the student dashboard'),

  define(PERMISSIONS.REPORTS_VIEW, 'View school reports'),
  define(PERMISSIONS.AUDIT_LOGS_VIEW, 'View audit logs'),

  define(PERMISSIONS.SETTINGS_MANAGE, 'Manage system settings'),
];

export const ALL_PERMISSION_CODES: PermissionCode[] = PERMISSION_DEFINITIONS.map((p) => p.code);

const ADMIN_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.USERS_VIEW,
  PERMISSIONS.USERS_CREATE,
  PERMISSIONS.USERS_UPDATE,
  PERMISSIONS.USERS_DISABLE,
  PERMISSIONS.USERS_RESET_PASSWORD,
  PERMISSIONS.USERS_ASSIGN_ROLES,
  PERMISSIONS.ROLES_VIEW,
  PERMISSIONS.STUDENTS_VIEW,
  PERMISSIONS.STUDENTS_CREATE,
  PERMISSIONS.STUDENTS_UPDATE,
  PERMISSIONS.STUDENTS_ARCHIVE,
  PERMISSIONS.PARENTS_VIEW,
  PERMISSIONS.PARENTS_CREATE,
  PERMISSIONS.PARENTS_UPDATE,
  PERMISSIONS.PARENTS_ARCHIVE,
  PERMISSIONS.PARENTS_LINK_STUDENTS,
  PERMISSIONS.TEACHERS_VIEW,
  PERMISSIONS.TEACHERS_CREATE,
  PERMISSIONS.TEACHERS_UPDATE,
  PERMISSIONS.TEACHERS_ARCHIVE,
  PERMISSIONS.TEACHERS_ASSIGN,
  PERMISSIONS.ACADEMIC_YEARS_VIEW,
  PERMISSIONS.ACADEMIC_YEARS_MANAGE,
  PERMISSIONS.ACADEMIC_YEARS_CLOSE,
  PERMISSIONS.GRADE_LEVELS_VIEW,
  PERMISSIONS.GRADE_LEVELS_MANAGE,
  PERMISSIONS.CLASSES_VIEW,
  PERMISSIONS.CLASSES_MANAGE,
  PERMISSIONS.SUBJECTS_VIEW,
  PERMISSIONS.SUBJECTS_MANAGE,
  PERMISSIONS.ROOMS_VIEW,
  PERMISSIONS.ROOMS_MANAGE,
  PERMISSIONS.ENROLLMENTS_VIEW,
  PERMISSIONS.ENROLLMENTS_MANAGE,
  PERMISSIONS.SCHEDULES_VIEW,
  PERMISSIONS.SCHEDULES_MANAGE,
  PERMISSIONS.ATTENDANCE_VIEW,
  PERMISSIONS.ATTENDANCE_RECORD,
  PERMISSIONS.ATTENDANCE_UPDATE_ANY,
  PERMISSIONS.ASSESSMENTS_VIEW,
  PERMISSIONS.ASSESSMENTS_MANAGE,
  PERMISSIONS.ASSESSMENTS_GRADE,
  PERMISSIONS.EXAMS_VIEW,
  PERMISSIONS.EXAMS_MANAGE,
  PERMISSIONS.GRADES_VIEW,
  PERMISSIONS.GRADES_ENTER,
  PERMISSIONS.GRADES_UPDATE_ANY,
  PERMISSIONS.REPORT_CARDS_VIEW,
  PERMISSIONS.REPORT_CARDS_GENERATE,
  PERMISSIONS.REPORT_CARDS_PUBLISH,
  /*
   * Homework is deliberately absent.
   *
   * It is a conversation between a teacher and their pupils: the teacher sets
   * it and marks it, the pupil hands it in, and the guardian follows their own
   * child's. The office neither sets homework nor answers for it, and giving
   * every administrator a list of every child's unfinished work is an intrusion
   * that buys nothing. SUPER_ADMIN keeps it as the break-glass role.
   */
  PERMISSIONS.BEHAVIORS_VIEW,
  PERMISSIONS.BEHAVIORS_MANAGE,
  PERMISSIONS.ANNOUNCEMENTS_VIEW,
  PERMISSIONS.ANNOUNCEMENTS_MANAGE,
  PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
  PERMISSIONS.NOTIFICATIONS_VIEW,
  PERMISSIONS.NOTIFICATIONS_SEND,
  PERMISSIONS.DASHBOARD_ADMIN,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.AUDIT_LOGS_VIEW,
];

const PRINCIPAL_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.STUDENTS_VIEW,
  PERMISSIONS.PARENTS_VIEW,
  PERMISSIONS.TEACHERS_VIEW,
  PERMISSIONS.ACADEMIC_YEARS_VIEW,
  PERMISSIONS.GRADE_LEVELS_VIEW,
  PERMISSIONS.CLASSES_VIEW,
  PERMISSIONS.SUBJECTS_VIEW,
  PERMISSIONS.ROOMS_VIEW,
  PERMISSIONS.ENROLLMENTS_VIEW,
  PERMISSIONS.SCHEDULES_VIEW,
  PERMISSIONS.ATTENDANCE_VIEW,
  PERMISSIONS.ASSESSMENTS_VIEW,
  PERMISSIONS.EXAMS_VIEW,
  PERMISSIONS.GRADES_VIEW,
  PERMISSIONS.REPORT_CARDS_VIEW,
  PERMISSIONS.REPORT_CARDS_PUBLISH,
  // Homework is left to the teachers, as above. A principal reviewing a
  // teacher's workload sees it through the dashboard rather than by reading
  // every class's homework list.
  PERMISSIONS.BEHAVIORS_VIEW,
  PERMISSIONS.ANNOUNCEMENTS_VIEW,
  PERMISSIONS.ANNOUNCEMENTS_MANAGE,
  PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
  PERMISSIONS.NOTIFICATIONS_VIEW,
  PERMISSIONS.DASHBOARD_PRINCIPAL,
  PERMISSIONS.REPORTS_VIEW,
];

const TEACHER_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.STUDENTS_VIEW,
  PERMISSIONS.PARENTS_VIEW,
  PERMISSIONS.CLASSES_VIEW,
  PERMISSIONS.SUBJECTS_VIEW,
  PERMISSIONS.GRADE_LEVELS_VIEW,
  PERMISSIONS.ACADEMIC_YEARS_VIEW,
  PERMISSIONS.ENROLLMENTS_VIEW,
  PERMISSIONS.SCHEDULES_VIEW,
  PERMISSIONS.ATTENDANCE_VIEW,
  PERMISSIONS.ATTENDANCE_RECORD,
  PERMISSIONS.ASSESSMENTS_VIEW,
  PERMISSIONS.ASSESSMENTS_MANAGE,
  PERMISSIONS.ASSESSMENTS_GRADE,
  PERMISSIONS.EXAMS_VIEW,
  PERMISSIONS.EXAMS_MANAGE,
  PERMISSIONS.GRADES_VIEW,
  PERMISSIONS.GRADES_ENTER,
  PERMISSIONS.REPORT_CARDS_VIEW,
  PERMISSIONS.ASSIGNMENTS_VIEW,
  PERMISSIONS.ASSIGNMENTS_MANAGE,
  PERMISSIONS.ASSIGNMENTS_GRADE,
  PERMISSIONS.BEHAVIORS_VIEW,
  PERMISSIONS.BEHAVIORS_MANAGE,
  PERMISSIONS.ANNOUNCEMENTS_VIEW,
  PERMISSIONS.NOTIFICATIONS_VIEW,
  PERMISSIONS.DASHBOARD_TEACHER,
];

const HOMEROOM_TEACHER_PERMISSIONS: PermissionCode[] = [
  ...TEACHER_PERMISSIONS,
  PERMISSIONS.ATTENDANCE_UPDATE_ANY,
  PERMISSIONS.REPORT_CARDS_GENERATE,
  PERMISSIONS.ANNOUNCEMENTS_MANAGE,
];

const PARENT_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.STUDENTS_VIEW_OWN,
  PERMISSIONS.SCHEDULES_VIEW,
  PERMISSIONS.ATTENDANCE_VIEW,
  PERMISSIONS.GRADES_VIEW,
  PERMISSIONS.ASSIGNMENTS_VIEW,
  PERMISSIONS.REPORT_CARDS_VIEW,
  PERMISSIONS.BEHAVIORS_VIEW,
  PERMISSIONS.ANNOUNCEMENTS_VIEW,
  PERMISSIONS.NOTIFICATIONS_VIEW,
  PERMISSIONS.DASHBOARD_PARENT,
];

const STUDENT_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.STUDENTS_VIEW_OWN,
  PERMISSIONS.SCHEDULES_VIEW,
  PERMISSIONS.ATTENDANCE_VIEW,
  PERMISSIONS.GRADES_VIEW,
  PERMISSIONS.ASSIGNMENTS_VIEW,
  // The one write a student may perform: handing in their own homework.
  PERMISSIONS.ASSIGNMENTS_SUBMIT,
  PERMISSIONS.REPORT_CARDS_VIEW,
  PERMISSIONS.ANNOUNCEMENTS_VIEW,
  PERMISSIONS.NOTIFICATIONS_VIEW,
  PERMISSIONS.DASHBOARD_STUDENT,
];

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  description: string;
  permissions: PermissionCode[] | 'ALL';
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Administrator',
    description: 'System-wide configuration and unrestricted access.',
    permissions: 'ALL',
  },
  {
    code: 'ADMIN',
    name: 'School Administrator',
    description: 'Day-to-day school administration.',
    permissions: ADMIN_PERMISSIONS,
  },
  {
    code: 'PRINCIPAL',
    name: 'Principal',
    description: 'School-wide monitoring, reporting and announcement approval.',
    permissions: PRINCIPAL_PERMISSIONS,
  },
  {
    code: 'TEACHER',
    name: 'Teacher',
    description: 'Teaching, attendance, assessments and grades for assigned classes.',
    permissions: TEACHER_PERMISSIONS,
  },
  {
    code: 'HOMEROOM_TEACHER',
    name: 'Homeroom Teacher',
    description: 'A teacher additionally responsible for one homeroom class.',
    permissions: HOMEROOM_TEACHER_PERMISSIONS,
  },
  {
    code: 'PARENT',
    name: 'Parent',
    description: 'Monitors the academic progress of linked children.',
    permissions: PARENT_PERMISSIONS,
  },
  {
    code: 'STUDENT',
    name: 'Student',
    description: 'Views own schedule, assignments, grades and attendance.',
    permissions: STUDENT_PERMISSIONS,
  },
];

/** Roles that may act on any student, class or subject regardless of assignment. */
export const ELEVATED_ROLES: RoleCode[] = ['SUPER_ADMIN', 'ADMIN', 'PRINCIPAL'];
