import { closePool, query } from '../connection';
import { logger } from '../../utils/logger';

/**
 * Checks that the seeded school hangs together.
 *
 * Seed data fails in a way that migrations and type checks cannot catch: every
 * row is individually valid, every foreign key resolves, and yet a pupil is
 * marked present in a class they do not attend, or a teacher sets homework in a
 * subject that class is not taught. Those are relationship faults, not
 * constraint faults, and the database will hold them happily.
 *
 * Each check below counts the rows that should not exist. A healthy school
 * returns zero for every one of them.
 */

const ACTIVE = '(SELECT id FROM academic_years WHERE is_active)';

interface Check {
  label: string;
  sql: string;
}

const CHECKS: Check[] = [
  // --- The register describes real lessons ---------------------------------
  {
    label: 'attendance for a pupil not enrolled in that class',
    sql: `SELECT COUNT(*)::int n FROM attendance a
           WHERE a.academic_year_id = ${ACTIVE}
             AND NOT EXISTS (SELECT 1 FROM enrollments e
                              WHERE e.id = a.enrollment_id AND e.student_id = a.student_id
                                AND e.class_id = a.class_id
                                AND e.academic_year_id = a.academic_year_id)`,
  },
  {
    label: 'attendance dated outside every term of its year',
    sql: `SELECT COUNT(*)::int n FROM attendance a
           WHERE a.academic_year_id = ${ACTIVE}
             AND NOT EXISTS (SELECT 1 FROM academic_terms t
                              WHERE t.academic_year_id = a.academic_year_id
                                AND a.attendance_date BETWEEN t.start_date AND t.end_date)`,
  },
  {
    label: 'attendance recorded on a weekend',
    sql: `SELECT COUNT(*)::int n FROM attendance
           WHERE academic_year_id = ${ACTIVE} AND EXTRACT(ISODOW FROM attendance_date) > 5`,
  },
  {
    label: 'attendance recorded for a day the school has not reached',
    sql: `SELECT COUNT(*)::int n FROM attendance
           WHERE academic_year_id = ${ACTIVE} AND attendance_date > CURRENT_DATE`,
  },

  // --- Assessment belongs to a subject the class is actually taught --------
  {
    label: 'assessment for a subject the class is not taught',
    sql: `SELECT COUNT(*)::int n FROM assessments a
           WHERE a.academic_year_id = ${ACTIVE}
             AND NOT EXISTS (SELECT 1 FROM class_subjects cs
                              WHERE cs.class_id = a.class_id AND cs.subject_id = a.subject_id)`,
  },
  {
    label: 'assessment dated outside its own term',
    sql: `SELECT COUNT(*)::int n FROM assessments a
           JOIN academic_terms t ON t.id = a.term_id
          WHERE a.academic_year_id = ${ACTIVE}
            AND a.assessment_date NOT BETWEEN t.start_date AND t.end_date`,
  },
  {
    label: 'mark recorded against an assessment nobody has sat yet',
    sql: `SELECT COUNT(*)::int n FROM assessment_results r
           JOIN assessments a ON a.id = r.assessment_id
          WHERE a.academic_year_id = ${ACTIVE} AND a.assessment_date > CURRENT_DATE`,
  },
  {
    label: 'mark for a pupil who is not in that class',
    sql: `SELECT COUNT(*)::int n FROM assessment_results r
           JOIN assessments a ON a.id = r.assessment_id
          WHERE a.academic_year_id = ${ACTIVE}
            AND NOT EXISTS (SELECT 1 FROM enrollments e
                             WHERE e.student_id = r.student_id AND e.class_id = a.class_id
                               AND e.academic_year_id = a.academic_year_id)`,
  },
  {
    label: 'exam result for a sitting that has not happened',
    sql: `SELECT COUNT(*)::int n FROM exam_results r JOIN exams e ON e.id = r.exam_id
           WHERE e.academic_year_id = ${ACTIVE} AND e.exam_date > CURRENT_DATE`,
  },

  // --- Homework is coherent -------------------------------------------------
  {
    label: 'assignment for a subject the class is not taught',
    sql: `SELECT COUNT(*)::int n FROM assignments a
           WHERE a.academic_year_id = ${ACTIVE}
             AND NOT EXISTS (SELECT 1 FROM class_subjects cs
                              WHERE cs.class_id = a.class_id AND cs.subject_id = a.subject_id)`,
  },
  {
    label: 'assignment dated outside its own term',
    sql: `SELECT COUNT(*)::int n FROM assignments a JOIN academic_terms t ON t.id = a.term_id
           WHERE a.academic_year_id = ${ACTIVE}
             AND a.assigned_date NOT BETWEEN t.start_date AND t.end_date`,
  },
  {
    label: 'submission from a pupil not in the class the work was set for',
    sql: `SELECT COUNT(*)::int n FROM submissions s JOIN assignments a ON a.id = s.assignment_id
           WHERE a.academic_year_id = ${ACTIVE}
             AND NOT EXISTS (SELECT 1 FROM enrollments e
                              WHERE e.student_id = s.student_id AND e.class_id = a.class_id
                                AND e.academic_year_id = a.academic_year_id)`,
  },
  {
    label: 'submission handed in before the work was set',
    sql: `SELECT COUNT(*)::int n FROM submissions s JOIN assignments a ON a.id = s.assignment_id
           WHERE a.academic_year_id = ${ACTIVE} AND s.submitted_at::date < a.assigned_date`,
  },
  {
    label: 'submission against homework the teacher has not published',
    sql: `SELECT COUNT(*)::int n FROM submissions s JOIN assignments a ON a.id = s.assignment_id
           WHERE a.academic_year_id = ${ACTIVE} AND a.status = 'DRAFT'`,
  },
  {
    label: 'graded submission carrying no score',
    sql: `SELECT COUNT(*)::int n FROM submissions s JOIN assignments a ON a.id = s.assignment_id
           WHERE a.academic_year_id = ${ACTIVE} AND s.status = 'GRADED' AND s.score IS NULL`,
  },
  {
    label: 'ungraded submission that already carries a score',
    sql: `SELECT COUNT(*)::int n FROM submissions s JOIN assignments a ON a.id = s.assignment_id
           WHERE a.academic_year_id = ${ACTIVE}
             AND s.status IN ('SUBMITTED', 'LATE', 'PENDING') AND s.score IS NOT NULL`,
  },
  {
    label: 'missing submission that nonetheless has work attached',
    sql: `SELECT COUNT(*)::int n FROM submissions s JOIN assignments a ON a.id = s.assignment_id
           WHERE a.academic_year_id = ${ACTIVE} AND s.status = 'MISSING'
             AND (s.submitted_at IS NOT NULL OR s.content IS NOT NULL)`,
  },

  // --- Results follow the roster -------------------------------------------
  {
    label: 'grade for a subject the class is not taught',
    sql: `SELECT COUNT(*)::int n FROM grades g
           WHERE g.academic_year_id = ${ACTIVE}
             AND NOT EXISTS (SELECT 1 FROM class_subjects cs
                              WHERE cs.class_id = g.class_id AND cs.subject_id = g.subject_id)`,
  },
  {
    label: 'grade whose enrolment points at a different pupil or class',
    sql: `SELECT COUNT(*)::int n FROM grades g JOIN enrollments e ON e.id = g.enrollment_id
           WHERE g.academic_year_id = ${ACTIVE}
             AND (e.class_id <> g.class_id OR e.student_id <> g.student_id)`,
  },
  {
    label: 'report card for a pupil with no enrolment in that class',
    sql: `SELECT COUNT(*)::int n FROM report_cards rc
           WHERE rc.academic_year_id = ${ACTIVE}
             AND NOT EXISTS (SELECT 1 FROM enrollments e
                              WHERE e.student_id = rc.student_id AND e.class_id = rc.class_id
                                AND e.academic_year_id = rc.academic_year_id)`,
  },
  {
    label: 'report card ranked outside 1..class size',
    sql: `SELECT COUNT(*)::int n FROM report_cards
           WHERE academic_year_id = ${ACTIVE}
             AND (rank_in_class < 1 OR rank_in_class > class_size)`,
  },
  {
    label: 'report card issued for a term that has not finished',
    sql: `SELECT COUNT(*)::int n FROM report_cards rc JOIN academic_terms t ON t.id = rc.term_id
           WHERE rc.academic_year_id = ${ACTIVE} AND t.end_date > CURRENT_DATE`,
  },
  {
    label: 'pupil enrolled more than once in the same year',
    sql: `SELECT COUNT(*)::int n FROM (SELECT student_id FROM enrollments
            WHERE academic_year_id = ${ACTIVE} GROUP BY 1 HAVING COUNT(*) > 1) x`,
  },

  // --- The timetable is workable -------------------------------------------
  {
    label: 'timetable clash: a teacher in two places at once',
    sql: `SELECT COUNT(*)::int n FROM schedules a JOIN schedules b
            ON a.id < b.id AND a.teacher_id = b.teacher_id AND a.day_of_week = b.day_of_week
           AND a.start_time < b.end_time AND b.start_time < a.end_time
          WHERE a.academic_year_id = ${ACTIVE} AND b.academic_year_id = ${ACTIVE}`,
  },
  {
    label: 'timetable clash: a class taught two subjects at once',
    sql: `SELECT COUNT(*)::int n FROM schedules a JOIN schedules b
            ON a.id < b.id AND a.class_id = b.class_id AND a.day_of_week = b.day_of_week
           AND a.start_time < b.end_time AND b.start_time < a.end_time
          WHERE a.academic_year_id = ${ACTIVE} AND b.academic_year_id = ${ACTIVE}`,
  },
];

const run = async (): Promise<void> => {
  const failures: string[] = [];

  for (const check of CHECKS) {
    const rows = (await query<{ n: number }>(check.sql)).rows[0].n;

    if (rows > 0) {
      failures.push(`${check.label}: ${rows} row(s)`);
      logger.error(`FAIL  ${check.label} — ${rows} offending row(s)`);
    } else {
      logger.info(`ok    ${check.label}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} of ${CHECKS.length} checks failed`);
  }

  logger.info(`All ${CHECKS.length} relationship checks pass.`);
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Verification failed', error);
    await closePool();
    process.exit(1);
  });
