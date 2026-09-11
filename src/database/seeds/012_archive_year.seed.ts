import type { PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { shiftYearName, weeks } from './school-calendar';

/**
 * Moves a finished academic year back in the calendar so it becomes last year's
 * archive, leaving the current year free to occupy the present.
 *
 * The school's 2025-2026 records are real: the report card averages were
 * transcribed from the printed achievement sheets. Rebuilding that year to make
 * room for an in-progress one would throw those away, and the system already
 * refuses to let two years overlap (`findOverlappingAcademicYear`), so the only
 * way to keep both is to move the finished one into the past.
 *
 * Nothing is deleted here and no relationship changes — every row keeps its
 * identity, its class, its marks and its report card. Only the dates move.
 */

/**
 * 52 weeks rather than a calendar year.
 *
 * A 365-day shift moves a Monday onto a Sunday, which would leave a term
 * starting at the weekend and scatter the register across days the school does
 * not open. 364 is divisible by seven, so every lesson, exam and register entry
 * lands on the same weekday it was recorded on.
 */
export const ARCHIVE_SHIFT_DAYS = weeks(52);

/** Every date column that describes when something happened during a year. */
const SHIFTED: { table: string; columns: string[]; scope: string }[] = [
  { table: 'academic_terms', columns: ['start_date', 'end_date'], scope: 'academic_year_id = $2' },
  { table: 'enrollments', columns: ['enrolled_date', 'end_date'], scope: 'academic_year_id = $2' },
  { table: 'attendance', columns: ['attendance_date'], scope: 'academic_year_id = $2' },
  { table: 'assessments', columns: ['assessment_date'], scope: 'academic_year_id = $2' },
  { table: 'exams', columns: ['exam_date'], scope: 'academic_year_id = $2' },
  {
    table: 'assignments',
    columns: ['assigned_date', 'due_date', 'published_at'],
    scope: 'academic_year_id = $2',
  },
  { table: 'grades', columns: ['calculated_at'], scope: 'academic_year_id = $2' },
  {
    table: 'report_cards',
    columns: ['generated_at', 'published_at'],
    scope: 'academic_year_id = $2',
  },
  { table: 'student_behaviors', columns: ['occurred_on'], scope: 'academic_year_id = $2' },
  {
    table: 'schedules',
    columns: ['effective_from', 'effective_to'],
    scope: 'academic_year_id = $2',
  },
  {
    table: 'announcements',
    columns: ['publish_at', 'published_at', 'expires_at', 'archived_at'],
    scope: 'academic_year_id = $2',
  },
  // These three hang off the year through a parent row rather than carrying the
  // year themselves, so each is scoped through that parent.
  {
    table: 'assessment_results',
    columns: ['graded_at'],
    scope: 'assessment_id IN (SELECT id FROM assessments WHERE academic_year_id = $2)',
  },
  {
    table: 'exam_results',
    columns: ['graded_at'],
    scope: 'exam_id IN (SELECT id FROM exams WHERE academic_year_id = $2)',
  },
  {
    table: 'submissions',
    columns: ['submitted_at', 'graded_at'],
    scope: 'assignment_id IN (SELECT id FROM assignments WHERE academic_year_id = $2)',
  },
];

export interface ArchiveResult {
  yearId: number;
  oldName: string;
  newName: string;
  start: string;
  end: string;
  rowsShifted: number;
}

/**
 * Archives the given year, or the active one if no id is supplied.
 *
 * Runs before the current-year seed, whose calendar must not overlap what this
 * leaves behind — the caller checks that, because only it knows the new dates.
 */
export const archiveYear = async (
  client: PoolClient,
  yearId?: number,
): Promise<ArchiveResult | null> => {
  const year = (
    await client.query<{ id: number; name: string; start_date: string; end_date: string }>(
      `SELECT id, name, start_date::text, end_date::text FROM academic_years
        WHERE ${yearId ? 'id = $1' : 'is_active'} LIMIT 1`,
      yearId ? [yearId] : [],
    )
  ).rows[0];

  if (!year) {
    logger.warn('No year to archive; skipping the shift.');

    return null;
  }

  /**
   * Only a year that has actually finished is archived.
   *
   * Without this the seed cannot be run twice: the second run would find the
   * half-taught year the first run built, shift it back a year on top of the
   * archive, and collide on the register's one-row-per-pupil-per-day rule. A
   * year the school is still teaching is not history, so it is left where it is.
   */
  const today = (
    await client.query<{ today: string }>('SELECT CURRENT_DATE::text AS today')
  ).rows[0].today;

  if (year.end_date >= today) {
    logger.info(
      `${year.name} runs to ${year.end_date} and is still being taught; nothing to archive.`,
    );

    return null;
  }

  const days = ARCHIVE_SHIFT_DAYS;
  let rowsShifted = 0;

  for (const target of SHIFTED) {
    const sets = target.columns.map((column) => `${column} = ${column} - ($1 || ' days')::interval`);
    const result = await client.query(
      `UPDATE ${target.table} SET ${sets.join(', ')} WHERE ${target.scope}`,
      [days, year.id],
    );

    rowsShifted += result.rowCount ?? 0;
  }

  /**
   * Every enrolment in a finished year has to be closed.
   *
   * An enrolment left ACTIVE keeps its pupil on this year's registers and
   * rosters for ever, which is what put leavers back on the attendance sheet
   * the first time round. Pupils who moved up are PROMOTED; the exit grade,
   * which has nowhere to move up to, is COMPLETED.
   */
  const closed = await client.query(
    `UPDATE enrollments e
        SET status = CASE WHEN g.is_exit_grade THEN 'COMPLETED' ELSE 'PROMOTED' END
                       ::enrollment_status,
            end_date = COALESCE(e.end_date, $2::date)
       FROM classes c
       JOIN grade_levels g ON g.id = c.grade_level_id
      WHERE c.id = e.class_id AND e.academic_year_id = $1 AND e.status = 'ACTIVE'`,
    [year.id, year.end_date],
  );

  /**
   * A closed year has no term in progress. Leaving the flag set makes term
   * pickers offer a semester that ended in a year the school has finished with.
   */
  await client.query('UPDATE academic_terms SET is_active = FALSE WHERE academic_year_id = $1', [
    year.id,
  ]);

  const shifted = await client.query<{ name: string; start_date: string; end_date: string }>(
    `UPDATE academic_years
        SET name = $2,
            start_date = start_date - ($3 || ' days')::interval,
            end_date = end_date - ($3 || ' days')::interval,
            status = 'CLOSED',
            is_active = FALSE,
            closed_at = COALESCE(closed_at, NOW())
      WHERE id = $1
      RETURNING name, start_date::text, end_date::text`,
    [year.id, shiftYearName(year.name, Math.round(days / 364)), days],
  );

  const after = shifted.rows[0];

  logger.info(
    `Archived ${year.name} as ${after.name}: ${after.start_date} to ${after.end_date}, ` +
      `${rowsShifted} dated row(s) moved back ${days} days, ` +
      `${closed.rowCount ?? 0} open enrolment(s) closed`,
  );

  return {
    yearId: year.id,
    oldName: year.name,
    newName: after.name,
    start: after.start_date,
    end: after.end_date,
    rowsShifted,
  };
};
