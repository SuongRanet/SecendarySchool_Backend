import { pool } from '../../database/connection';

export interface SchoolCounts {
  totalStudents: number;
  totalTeachers: number;
  totalParents: number;
  totalClasses: number;
  totalSubjects: number;
  activeEnrollments: number;
}

export const schoolCounts = async (academicYearId: number): Promise<SchoolCounts> => {
  const result = await pool.query<SchoolCounts>(
    `SELECT
       (SELECT COUNT(*)::int FROM students WHERE deleted_at IS NULL AND status = 'ACTIVE') AS "totalStudents",
       (SELECT COUNT(*)::int FROM teachers WHERE deleted_at IS NULL AND status = 'ACTIVE') AS "totalTeachers",
       (SELECT COUNT(*)::int FROM parents WHERE deleted_at IS NULL AND is_active) AS "totalParents",
       (SELECT COUNT(*)::int FROM classes
         WHERE deleted_at IS NULL AND is_active AND academic_year_id = $1) AS "totalClasses",
       (SELECT COUNT(*)::int FROM subjects WHERE deleted_at IS NULL AND is_active) AS "totalSubjects",
       (SELECT COUNT(*)::int FROM enrollments
         WHERE academic_year_id = $1 AND status = 'ACTIVE') AS "activeEnrollments"`,
    [academicYearId],
  );

  return result.rows[0];
};

export const genderBreakdown = async (
  academicYearId: number,
): Promise<{ gender: string; count: number }[]> => {
  const result = await pool.query<{ gender: string; count: number }>(
    `SELECT COALESCE(s.gender::text, 'UNSPECIFIED') AS gender, COUNT(*)::int AS count
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
      WHERE e.academic_year_id = $1 AND e.status = 'ACTIVE' AND s.deleted_at IS NULL
      GROUP BY s.gender`,
    [academicYearId],
  );

  return result.rows;
};

export const teacherWorkload = async (
  academicYearId: number,
): Promise<{ teacherId: number; teacherName: string; classCount: number; periodCount: number }[]> => {
  const result = await pool.query<{
    teacherId: number;
    teacherName: string;
    classCount: number;
    periodCount: number;
  }>(
    `SELECT t.id AS "teacherId",
            TRIM(CONCAT(t.first_name_en, ' ', t.last_name_en)) AS "teacherName",
            COUNT(DISTINCT cs.class_id)::int AS "classCount",
            (SELECT COUNT(*)::int FROM schedules sc
              WHERE sc.teacher_id = t.id AND sc.academic_year_id = $1 AND sc.is_active) AS "periodCount"
       FROM teachers t
       LEFT JOIN class_subjects cs ON cs.teacher_id = t.id AND cs.is_active
       LEFT JOIN classes c ON c.id = cs.class_id AND c.academic_year_id = $1
      WHERE t.deleted_at IS NULL AND t.status = 'ACTIVE'
      GROUP BY t.id, t.first_name_en, t.last_name_en
      ORDER BY "periodCount" DESC, "teacherName" ASC
      LIMIT 20`,
    [academicYearId],
  );

  return result.rows;
};

/** Recently published announcements visible to everybody. */
export const recentAnnouncements = async (
  limit = 5,
): Promise<
  { id: number; title: string; audience: string; publishedAt: Date | null; isPinned: boolean }[]
> => {
  const result = await pool.query<{
    id: number;
    title: string;
    audience: string;
    publishedAt: Date | null;
    isPinned: boolean;
  }>(
    `SELECT id, title, audience::text AS audience, published_at AS "publishedAt", is_pinned AS "isPinned"
       FROM announcements
      WHERE status = 'PUBLISHED'
      ORDER BY is_pinned DESC, published_at DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );

  return result.rows;
};

export const overallAcademicPerformance = async (
  academicYearId: number,
  termId: number | null,
): Promise<{ average: number | null; excellent: number; good: number; fair: number; needsImprovement: number }> => {
  const result = await pool.query<{
    average: number | null;
    excellent: number;
    good: number;
    fair: number;
    needsImprovement: number;
  }>(
    `SELECT ROUND(AVG(percentage)::numeric, 2) AS average,
            COUNT(*) FILTER (WHERE performance = 'EXCELLENT')::int AS excellent,
            COUNT(*) FILTER (WHERE performance = 'GOOD')::int AS good,
            COUNT(*) FILTER (WHERE performance = 'FAIR')::int AS fair,
            COUNT(*) FILTER (WHERE performance = 'NEEDS_IMPROVEMENT')::int AS "needsImprovement"
       FROM grades
      WHERE academic_year_id = $1
        AND COALESCE(term_id, 0) = COALESCE($2::bigint, 0)`,
    [academicYearId, termId],
  );

  return (
    result.rows[0] ?? { average: null, excellent: 0, good: 0, fair: 0, needsImprovement: 0 }
  );
};

/** A guardian's dashboard summary for one child. */
export const childSummary = async (
  studentId: number,
  academicYearId: number,
): Promise<{
  attendancePercent: number | null;
  averageScore: number | null;
  pendingAssignments: number;
  unreadNotifications: number;
}> => {
  const result = await pool.query<{
    attendancePercent: number | null;
    averageScore: number | null;
    pendingAssignments: number;
    unreadNotifications: number;
  }>(
    `SELECT
       (SELECT ROUND(
                 (COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))::numeric
                  / NULLIF(COUNT(*), 0) * 100), 2)
          FROM attendance
         WHERE student_id = $1 AND academic_year_id = $2) AS "attendancePercent",
       (SELECT ROUND(AVG(percentage)::numeric, 2)
          FROM grades
         WHERE student_id = $1 AND academic_year_id = $2) AS "averageScore",
       (SELECT COUNT(*)::int
          FROM assignments a
          JOIN enrollments e ON e.class_id = a.class_id
                            AND e.student_id = $1
                            AND e.status = 'ACTIVE'
          LEFT JOIN submissions sub ON sub.assignment_id = a.id AND sub.student_id = $1
         WHERE a.status = 'PUBLISHED'
           AND a.due_date >= CURRENT_DATE
           AND a.deleted_at IS NULL
           AND (sub.id IS NULL OR sub.status = 'PENDING')) AS "pendingAssignments",
       (SELECT COUNT(*)::int
          FROM notification_recipients nr
          JOIN students s ON s.id = $1
         WHERE nr.user_id = s.user_id AND nr.read_at IS NULL) AS "unreadNotifications"`,
    [studentId, academicYearId],
  );

  return (
    result.rows[0] ?? {
      attendancePercent: null,
      averageScore: null,
      pendingAssignments: 0,
      unreadNotifications: 0,
    }
  );
};

export const teacherCounts = async (
  teacherId: number,
  academicYearId: number,
): Promise<{ classCount: number; studentCount: number; subjectCount: number }> => {
  const result = await pool.query<{
    classCount: number;
    studentCount: number;
    subjectCount: number;
  }>(
    `SELECT
       (SELECT COUNT(DISTINCT c.id)::int
          FROM classes c
         WHERE c.academic_year_id = $2
           AND c.deleted_at IS NULL
           AND (c.homeroom_teacher_id = $1
                OR EXISTS (SELECT 1 FROM class_subjects cs
                            WHERE cs.class_id = c.id AND cs.teacher_id = $1 AND cs.is_active))) AS "classCount",
       (SELECT COUNT(DISTINCT e.student_id)::int
          FROM enrollments e
          JOIN classes c2 ON c2.id = e.class_id
         WHERE e.status = 'ACTIVE'
           AND c2.academic_year_id = $2
           AND (c2.homeroom_teacher_id = $1
                OR EXISTS (SELECT 1 FROM class_subjects cs2
                            WHERE cs2.class_id = c2.id AND cs2.teacher_id = $1 AND cs2.is_active))) AS "studentCount",
       (SELECT COUNT(DISTINCT cs3.subject_id)::int
          FROM class_subjects cs3
          JOIN classes c3 ON c3.id = cs3.class_id
         WHERE cs3.teacher_id = $1 AND c3.academic_year_id = $2 AND cs3.is_active) AS "subjectCount"`,
    [teacherId, academicYearId],
  );

  return result.rows[0] ?? { classCount: 0, studentCount: 0, subjectCount: 0 };
};
