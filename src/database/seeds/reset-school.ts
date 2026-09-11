import type { PoolClient } from 'pg';
import { closePool, withTransaction } from '../connection';
import { logger } from '../../utils/logger';

/**
 * Clears the school's people and everything hanging off them, so the population
 * seed can build the year again from nothing.
 *
 * What it removes: students, guardians, teachers, classes, enrolments, the
 * timetable, the register, assessments, grades and report cards, together with
 * the logins that belong to those people.
 *
 * What it keeps: roles, permissions, the super administrator, the academic year
 * and its terms, the grade levels, the subjects, the rooms and the grading
 * scheme — everything the standard `npm run seed` puts in place.
 *
 * This is destructive and irreversible, so it refuses to run without `--yes`.
 */

/**
 * Ordered child-to-parent, so nothing is removed while a foreign key still
 * points at it. `DELETE` rather than `TRUNCATE` because the tables that survive
 * reference these by id and TRUNCATE would need to cascade into them.
 */
const TABLES = [
  'report_card_subjects',
  'report_cards',
  'grades',
  'exam_results',
  'exams',
  'assessment_results',
  'assessments',
  'submissions',
  'assignments',
  'student_behaviors',
  'student_comments',
  'attendance',
  'schedules',
  'notification_recipients',
  'notifications',
  'announcements',
  'student_parents',
  'enrollments',
  'teacher_subjects',
  'teacher_classes',
  'class_subjects',
  'classes',
  'students',
  'parents',
  'teachers',
];

const resetSchool = async (client: PoolClient): Promise<void> => {
  for (const table of TABLES) {
    const exists = await client.query<{ present: boolean }>(
      'SELECT to_regclass($1) IS NOT NULL AS present',
      [table],
    );

    if (!exists.rows[0].present) {
      continue;
    }

    const result = await client.query(`DELETE FROM ${table}`);

    if (result.rowCount) {
      logger.info(`Cleared ${result.rowCount} row(s) from ${table}`);
    }
  }

  /**
   * The logins of the people just removed. The super administrator is kept by
   * name, and so is anyone still attached to a record — by this point nobody
   * should be, but a login left stranded is better than one deleted by mistake.
   */
  const users = await client.query(
    `DELETE FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM user_roles ur
                         JOIN roles r ON r.id = ur.role_id
                        WHERE ur.user_id = u.id AND r.code = 'SUPER_ADMIN')
        AND NOT EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM parents p WHERE p.user_id = u.id)`,
  );

  logger.info(`Cleared ${users.rowCount ?? 0} login(s)`);
};

const run = async (): Promise<void> => {
  if (!process.argv.includes('--yes')) {
    logger.warn(
      'This removes every student, guardian, teacher, class, timetable, register ' +
        'entry, assessment, grade and report card. Roles, the super administrator, ' +
        'the academic year, subjects and rooms are kept.',
    );
    logger.warn('Re-run with --yes to go ahead:  npm run seed:reset-school -- --yes');
    return;
  }

  await withTransaction(resetSchool);
  logger.info('School data cleared. Run "npm run seed:population" to build the year again.');
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Reset failed', error);
    await closePool();
    process.exit(1);
  });
