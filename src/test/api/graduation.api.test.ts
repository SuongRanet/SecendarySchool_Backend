import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../../config';
import { asUser, describeApi, login } from '../integration';
import { query } from '../../database/connection';
import { createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';
import type { Session } from '../integration';

/**
 * A pupil in the final grade of the cycle leaves rather than moving up, and
 * `grade_levels.is_exit_grade` is what records which grade that is. Before this
 * endpoint existed the flag was stored and never read: year-end promoted every
 * other cohort and left the leavers enrolled, so the office had to mark all
 * eighty-four of them by hand or they stayed on the rosters for ever.
 */
describeApi('graduating the exit grade', () => {
  let session: Session;
  let fixtures: Fixtures;
  let studentId: number;

  beforeAll(async () => {
    session = await login(env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_PASSWORD);
    fixtures = await createFixtures(session);

    const student = await asUser(session).post('/api/v1/students').send({
      firstNameEn: 'Leaver',
      lastNameEn: `Test ${fixtures.suffix}`,
      enrollment: { academicYearId: fixtures.academicYearId, classId: fixtures.classId },
    });

    studentId = student.body.data.id;
  });

  afterAll(async () => {
    await query('DELETE FROM enrollments WHERE student_id = $1', [studentId]);
    await query('DELETE FROM students WHERE id = $1', [studentId]);
    await fixtures.teardown();
  });

  it('refuses when no grade in the year is marked as the exit grade', async () => {
    await query('UPDATE grade_levels SET is_exit_grade = FALSE WHERE id = $1', [
      fixtures.gradeLevelId,
    ]);

    const response = await asUser(session)
      .post('/api/v1/enrollments/graduate')
      .send({ academicYearId: fixtures.academicYearId });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_EXIT_GRADE_STUDENTS');
  });

  it('graduates the pupils of the exit grade and closes their enrolment', async () => {
    await query('UPDATE grade_levels SET is_exit_grade = TRUE WHERE id = $1', [
      fixtures.gradeLevelId,
    ]);

    const response = await asUser(session)
      .post('/api/v1/enrollments/graduate')
      .send({ academicYearId: fixtures.academicYearId });

    expect(response.status).toBe(200);
    expect(response.body.data.graduated).toBeGreaterThanOrEqual(1);

    // Both halves have to happen: the pupil is gone, and so is their place on
    // the roster. Leaving either behind keeps a leaver in the school.
    const student = (
      await query<{ status: string }>('SELECT status FROM students WHERE id = $1', [studentId])
    ).rows[0];
    const enrolment = (
      await query<{ status: string; end_date: string | null }>(
        `SELECT status::text, end_date FROM enrollments
          WHERE student_id = $1 AND academic_year_id = $2`,
        [studentId, fixtures.academicYearId],
      )
    ).rows[0];

    expect(student.status).toBe('GRADUATED');
    expect(enrolment.status).toBe('COMPLETED');
    expect(enrolment.end_date).not.toBeNull();
  });

  it("keeps a graduated pupil in the year's own statistics", async () => {
    /**
     * The year the pupil belonged to must not shrink when they leave it.
     * Counting only ACTIVE enrolments showed a class of forty-six as empty the
     * moment its pupils were promoted, and the leaving year group as zero — the
     * dashboard erased the year instead of describing it.
     */
    const stats = await asUser(session).get(
      `/api/v1/enrollments/stats/by-class?academicYearId=${fixtures.academicYearId}`,
    );

    expect(stats.status).toBe(200);

    const row = (stats.body.data as { classId: number; count: number }[]).find(
      (entry) => entry.classId === fixtures.classId,
    );

    // The pupil graduated in the test above, so their enrolment is COMPLETED.
    expect(row).toBeDefined();
    expect(row?.count).toBeGreaterThanOrEqual(1);
  });

  it('leaves an excluded pupil enrolled', async () => {
    const stayer = await asUser(session).post('/api/v1/students').send({
      firstNameEn: 'Stayer',
      lastNameEn: `Test ${fixtures.suffix}`,
      enrollment: { academicYearId: fixtures.academicYearId, classId: fixtures.classId },
    });

    const stayerId: number = stayer.body.data.id;

    const response = await asUser(session)
      .post('/api/v1/enrollments/graduate')
      .send({ academicYearId: fixtures.academicYearId, excludeStudentIds: [stayerId] });

    expect(response.status).toBe(200);
    expect(response.body.data.skipped).toBe(1);

    const student = (
      await query<{ status: string }>('SELECT status FROM students WHERE id = $1', [stayerId])
    ).rows[0];

    expect(student.status).toBe('ACTIVE');

    await query('DELETE FROM enrollments WHERE student_id = $1', [stayerId]);
    await query('DELETE FROM students WHERE id = $1', [stayerId]);
  });
});
