import { Router } from 'express';
import academicYearRoutes from '../modules/academic-years/academic-year.routes';
import announcementRoutes from '../modules/announcements/announcement.routes';
import assessmentRoutes from '../modules/assessments/assessment.routes';
import assignmentRoutes from '../modules/assignments/assignment.routes';
import attendanceRoutes from '../modules/attendance/attendance.routes';
import auditRoutes from '../modules/audit/audit.routes';
import authRoutes from '../modules/auth/auth.routes';
import behaviorRoutes from '../modules/behaviors/behavior.routes';
import classRoutes from '../modules/classes/class.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import enrollmentRoutes from '../modules/enrollments/enrollment.routes';
import examRoutes from '../modules/exams/exam.routes';
import gradeLevelRoutes from '../modules/grade-levels/grade-level.routes';
import gradeRoutes from '../modules/grades/grade.routes';
import nationalExamRoutes from '../modules/national-exams/national-exam.routes';
import notificationRoutes from '../modules/notifications/notification.routes';
import parentRoutes from '../modules/parents/parent.routes';
import reportCardRoutes from '../modules/report-cards/report-card.routes';
import roleRoutes from '../modules/roles/role.routes';
import roomRoutes from '../modules/rooms/room.routes';
import scheduleRoutes from '../modules/schedules/schedule.routes';
import studentRoutes from '../modules/students/student.routes';
import subjectRoutes from '../modules/subjects/subject.routes';
import teacherRoutes from '../modules/teachers/teacher.routes';
import userRoutes from '../modules/users/user.routes';

const router = Router();

// Identity and access
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);

// Academic structure
router.use('/academic-years', academicYearRoutes);
router.use('/grade-levels', gradeLevelRoutes);
router.use('/rooms', roomRoutes);
router.use('/subjects', subjectRoutes);
router.use('/classes', classRoutes);

// People
router.use('/teachers', teacherRoutes);
router.use('/students', studentRoutes);
router.use('/parents', parentRoutes);

// Enrollment
router.use('/enrollments', enrollmentRoutes);

// Daily operations
router.use('/schedules', scheduleRoutes);
router.use('/attendance', attendanceRoutes);

// Academic performance
router.use('/assessments', assessmentRoutes);
router.use('/exams', examRoutes);
router.use('/national-exams', nationalExamRoutes);
router.use('/grades', gradeRoutes);
router.use('/report-cards', reportCardRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/behaviors', behaviorRoutes);

// Communication
router.use('/announcements', announcementRoutes);
router.use('/notifications', notificationRoutes);

// Insight
router.use('/dashboard', dashboardRoutes);
router.use('/audit-logs', auditRoutes);

export default router;
