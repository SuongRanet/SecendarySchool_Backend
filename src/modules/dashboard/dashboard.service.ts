import type { AuthenticatedUser } from '../../types';
import { AppError } from '../../utils/app-error';
import * as academicYearService from '../academic-years/academic-year.service';
import * as assessmentService from '../assessments/assessment.service';
import * as attendanceService from '../attendance/attendance.service';
import * as classService from '../classes/class.service';
import * as enrollmentService from '../enrollments/enrollment.service';
import * as examService from '../exams/exam.service';
import * as gradeService from '../grades/grade.service';
import * as parentService from '../parents/parent.service';
import * as scheduleService from '../schedules/schedule.service';
import * as studentService from '../students/student.service';
import * as repository from './dashboard.repository';

/**
 * The administrator overview: headline counts, today's attendance, enrollment
 * distribution and the most recent announcements.
 */
export const adminDashboard = async (attendanceDate?: string) => {
  const year = await academicYearService.requireActiveYear();

  const [counts, attendanceToday, enrollmentByGrade, classDistribution, studentStatus, gender, announcements, upcomingExams] =
    await Promise.all([
      repository.schoolCounts(year.id),
      attendanceService.dayOverview(year.id, attendanceDate),
      enrollmentService.enrollmentStatsByGrade(year.id),
      enrollmentService.enrollmentStatsByClass(year.id),
      studentService.statusBreakdown(),
      repository.genderBreakdown(year.id),
      repository.recentAnnouncements(5),
      examService.listUpcoming(year.id, 5),
    ]);

  return {
    academicYear: { id: year.id, name: year.name, startDate: year.start_date, endDate: year.end_date },
    counts,
    attendanceToday,
    enrollmentByGrade,
    classDistribution,
    studentStatus,
    gender,
    announcements,
    upcomingExams,
  };
};

/** The principal overview: performance and school-wide indicators. */
export const principalDashboard = async (termId?: number, attendanceDate?: string) => {
  const year = await academicYearService.requireActiveYear();

  const [counts, attendanceToday, performance, classAverages, teacherWorkload, enrollmentByGrade, trend] =
    await Promise.all([
      repository.schoolCounts(year.id),
      attendanceService.dayOverview(year.id, attendanceDate),
      repository.overallAcademicPerformance(year.id, termId ?? null),
      gradeService.classAverages(year.id, termId ?? null),
      repository.teacherWorkload(year.id),
      enrollmentService.enrollmentStatsByGrade(year.id),
      attendanceService.dailyTrend({
        academicYearId: year.id,
        dateFrom: new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10),
        dateTo: new Date().toISOString().slice(0, 10),
      }),
    ]);

  return {
    academicYear: { id: year.id, name: year.name },
    counts,
    attendanceToday,
    performance,
    classAverages,
    teacherWorkload,
    enrollmentByGrade,
    attendanceTrend: trend,
  };
};

/** The teacher workspace: today's classes and everything still waiting for them. */
export const teacherDashboard = async (user: AuthenticatedUser) => {
  if (!user.teacherId) {
    throw AppError.notFound('No teacher profile is linked to this account', 'TEACHER_NOT_FOUND');
  }

  const year = await academicYearService.requireActiveYear();
  const today = new Date().toISOString().slice(0, 10);

  const [counts, todaySchedule, myClasses, pendingAttendance, pendingGrading, upcomingExams] =
    await Promise.all([
      repository.teacherCounts(user.teacherId, year.id),
      scheduleService.listForToday({ teacherId: user.teacherId }),
      classService.listAll({ academicYearId: year.id, teacherId: user.teacherId, isActive: true }),
      attendanceService.listClassesMissingAttendance(year.id, today, user.teacherId),
      assessmentService.listPendingGrading(user.teacherId, year.id),
      examService.listUpcoming(year.id, 5),
    ]);

  return {
    academicYear: { id: year.id, name: year.name },
    counts,
    todaySchedule,
    myClasses,
    pendingAttendance,
    pendingGrading,
    upcomingExams,
  };
};

/** The parent portal landing data: one summary card per linked child. */
export const parentDashboard = async (user: AuthenticatedUser) => {
  if (!user.parentId) {
    throw AppError.notFound('No guardian profile is linked to this account', 'PARENT_NOT_FOUND');
  }

  const year = await academicYearService.requireActiveYear();
  const children = await parentService.listChildren(user.parentId);

  const summaries = await Promise.all(
    children.map(async (child) => ({
      ...child,
      summary: await repository.childSummary(child.studentId, year.id),
    })),
  );

  const announcements = await repository.recentAnnouncements(5);

  return {
    academicYear: { id: year.id, name: year.name },
    children: summaries,
    announcements,
  };
};

/** The student view of their own school day. */
export const studentDashboard = async (user: AuthenticatedUser) => {
  if (!user.studentId) {
    throw AppError.notFound('No student profile is linked to this account', 'STUDENT_NOT_FOUND');
  }

  const year = await academicYearService.requireActiveYear();

  const [summary, schedule, grades, attendance, announcements] = await Promise.all([
    repository.childSummary(user.studentId, year.id),
    scheduleService.list({ studentId: user.studentId, academicYearId: year.id, isActive: true }),
    gradeService.listForStudent(user.studentId, { academicYearId: year.id }),
    attendanceService.summarizeStudent(user.studentId, { academicYearId: year.id }),
    repository.recentAnnouncements(5),
  ]);

  return {
    academicYear: { id: year.id, name: year.name },
    summary,
    schedule,
    grades,
    attendance,
    announcements,
  };
};
