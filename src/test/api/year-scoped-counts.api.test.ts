import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../../config';
import { asUser, describeApi, login, unique } from '../integration';
import { query } from '../../database/connection';
import { createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';
import type { Session } from '../integration';

/**
 * Once the school has run more than one academic year, any figure that counts
 * through `classes` or `class_subjects` without naming a year sums every year
 * the school has ever had.
 *
 * That is what happened. A teacher who took 8A last year and 8A again this year
 * was credited with seventeen classes — the eight of the closed year plus the
 * nine of the current one — and their timetable came back with both years'
 * periods stacked, so every slot on the week appeared to hold two lessons at
 * once. The dashboard's subject, pupil and guardian totals counted the whole
 * database rather than the year named on the page.
 *
 * The fault needs two years to show itself, so this suite builds a second one
 * and gives both the same teacher.
 */
describeApi('a teacher who teaches in two years is not counted twice', () => {
  let session: Session;
  let fixtures: Fixtures;
  let secondYearId: number;
  let secondClassId: number;

  beforeAll(async () => {
    session = await login(env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_PASSWORD);
    fixtures = await createFixtures(session);

    /**
     * A second year that does not overlap the fixture's own, which runs to the
     * 31st of January following its start.
     *
     * The window is searched rather than calculated: fixtures claim a random
     * far-future year, and one left behind by an interrupted run may already
     * occupy the slot after this one. Retrying a year at a time finds the first
     * free window instead of failing on a collision that says nothing about the
     * behaviour under test.
     */
    let claimed: Awaited<ReturnType<ReturnType<typeof asUser>['post']>> | null = null;

    for (let offset = 1; offset <= 12 && !claimed; offset += 1) {
      const attempt = await asUser(session).post('/api/v1/academic-years').send({
        name: `Following ${unique()}`,
        startDate: `${fixtures.year + offset}-03-02`,
        endDate: `${fixtures.year + offset}-12-11`,
      });

      if (attempt.status === 201) {
        claimed = attempt;
      }
    }

    if (!claimed) {
      throw new Error('Could not claim a free academic year window for the second year');
    }

    const year = claimed;

    secondYearId = year.body.data.id;

    // The same teacher, teaching the same subject, in a class of the new year.
    const created = await asUser(session).post('/api/v1/classes').send({
      academicYearId: secondYearId,
      gradeLevelId: fixtures.gradeLevelId,
      code: `NX${fixtures.suffix}`,
      name: `Next Year Class ${fixtures.suffix}`,
      capacity: 40,
      subjects: [{ subjectId: fixtures.subjectId, teacherId: fixtures.teacherId }],
    });

    expect(created.status).toBe(201);
    secondClassId = created.body.data.id;
  });

  afterAll(async () => {
    await asUser(session).delete(`/api/v1/classes/${secondClassId}`);

    /**
     * Removed directly rather than through the API.
     *
     * Classes are archived rather than deleted, so the year still has one
     * attached and `DELETE /academic-years/:id` refuses it. Leaving the year
     * behind is not harmless: fixture years are claimed from a random window,
     * and every abandoned one makes the next suite more likely to collide with
     * it — eleven had piled up before this was noticed.
     */
    await query('DELETE FROM classes WHERE academic_year_id = $1', [secondYearId]);
    await query('DELETE FROM academic_terms WHERE academic_year_id = $1', [secondYearId]);
    await query('DELETE FROM academic_years WHERE id = $1', [secondYearId]);

    await fixtures.teardown();
  });

  it('returns only the named year of assignments', async () => {
    const response = await asUser(session).get(
      `/api/v1/teachers/${fixtures.teacherId}/assignments?academicYearId=${secondYearId}`,
    );

    expect(response.status).toBe(200);

    const rows = response.body.data as { classId: number; academicYearId: number }[];

    expect(rows.length).toBeGreaterThan(0);
    expect([...new Set(rows.map((row) => row.academicYearId))]).toEqual([secondYearId]);
    expect(rows.every((row) => row.classId !== fixtures.classId)).toBe(true);
  });

  it('still returns both years when no year is named, for the record page', async () => {
    // The administrator's teacher page prints an academic-year column beside
    // every row, so this endpoint is deliberately a history when unscoped.
    const response = await asUser(session).get(
      `/api/v1/teachers/${fixtures.teacherId}/assignments`,
    );

    const years = new Set(
      (response.body.data as { academicYearId: number }[]).map((row) => row.academicYearId),
    );

    expect(years.has(fixtures.academicYearId)).toBe(true);
    expect(years.has(secondYearId)).toBe(true);
  });

  it('returns only the named year of the timetable', async () => {
    const response = await asUser(session).get(
      `/api/v1/teachers/${fixtures.teacherId}/schedule?academicYearId=${secondYearId}`,
    );

    expect(response.status).toBe(200);

    const periods = response.body.data as { academicYearId: number }[];

    for (const period of periods) {
      expect(period.academicYearId).toBe(secondYearId);
    }
  });

  it('counts only the active year of classes on the teacher record', async () => {
    /**
     * The teacher now teaches the same subject in a class of each year, so an
     * unscoped count returns two. The number on the record describes the year
     * the school is actually in, and neither of these fixture years is active —
     * so the honest answer is however many the active year holds, which is what
     * this compares against rather than a hard-coded figure.
     */
    const response = await asUser(session).get(`/api/v1/teachers/${fixtures.teacherId}`);

    expect(response.status).toBe(200);

    const bothYears = await query<{ n: number }>(
      `SELECT COUNT(DISTINCT cs.class_id)::int AS n
         FROM class_subjects cs
        WHERE cs.teacher_id = $1 AND cs.is_active`,
      [fixtures.teacherId],
    );

    const activeYearOnly = await query<{ n: number }>(
      `SELECT COUNT(DISTINCT cs.class_id)::int AS n
         FROM class_subjects cs
         JOIN classes c ON c.id = cs.class_id
        WHERE cs.teacher_id = $1 AND cs.is_active AND c.deleted_at IS NULL
          AND c.academic_year_id = (SELECT id FROM academic_years WHERE is_active)`,
      [fixtures.teacherId],
    );

    // The fixture built a class in each of two years, so the unscoped count is
    // genuinely larger — without that the comparison below would pass for the
    // wrong reason.
    expect(bothYears.rows[0].n).toBeGreaterThanOrEqual(2);
    expect(bothYears.rows[0].n).toBeGreaterThan(activeYearOnly.rows[0].n);

    expect(response.body.data.classCount).toBe(activeYearOnly.rows[0].n);
  });

  it('counts only the active year of classes against a subject', async () => {
    /**
     * The subject list showed every subject teaching seventeen classes: this
     * year's nine plus last year's eight. A class_subjects row carries no year
     * itself, so the count has to reach through the class to find one.
     */
    const response = await asUser(session).get(
      `/api/v1/subjects?limit=100`,
    );

    expect(response.status).toBe(200);

    const subject = (response.body.data as { id: number; classCount: number }[]).find(
      (row) => row.id === fixtures.subjectId,
    );

    const acrossYears = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM class_subjects WHERE subject_id = $1 AND is_active`,
      [fixtures.subjectId],
    );

    const activeYearOnly = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
         FROM class_subjects cs
         JOIN classes c ON c.id = cs.class_id
        WHERE cs.subject_id = $1 AND cs.is_active AND c.deleted_at IS NULL
          AND c.academic_year_id = (SELECT id FROM academic_years WHERE is_active)`,
      [fixtures.subjectId],
    );

    expect(acrossYears.rows[0].n).toBeGreaterThan(activeYearOnly.rows[0].n);
    expect(subject?.classCount).toBe(activeYearOnly.rows[0].n);
  });

  it('counts only the active year of classes against a grade level', async () => {
    const response = await asUser(session).get('/api/v1/grade-levels');

    expect(response.status).toBe(200);

    const grade = (response.body.data as { id: number; classCount: number }[]).find(
      (row) => row.id === fixtures.gradeLevelId,
    );

    const acrossYears = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM classes
        WHERE grade_level_id = $1 AND deleted_at IS NULL`,
      [fixtures.gradeLevelId],
    );

    const activeYearOnly = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM classes
        WHERE grade_level_id = $1 AND deleted_at IS NULL
          AND academic_year_id = (SELECT id FROM academic_years WHERE is_active)`,
      [fixtures.gradeLevelId],
    );

    expect(acrossYears.rows[0].n).toBeGreaterThan(activeYearOnly.rows[0].n);
    expect(grade?.classCount).toBe(activeYearOnly.rows[0].n);
  });
});
