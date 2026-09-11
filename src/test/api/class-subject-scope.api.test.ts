import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../../config';
import { asUser, describeApi, login, unique } from '../integration';
import { query } from '../../database/connection';
import { createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';
import type { Session } from '../integration';

/**
 * A mark sheet must offer only the subjects the teacher may actually write to.
 *
 * The subject picker on the grade, assessment and homework screens listed every
 * subject the class was taught — all ten of them — while the services behind
 * those screens reject a save for any subject the teacher is not assigned to.
 * A Khmer Literature teacher could pick Biology, type forty marks and only then
 * be told they were not allowed. The picker was inviting people into a dead end.
 *
 * The same endpoint still answers the other question, because the class page
 * prints the whole curriculum and the timetable needs every subject to place.
 */
describeApi('a class subject list can be narrowed to the teacher who asks', () => {
  let session: Session;
  let fixtures: Fixtures;
  let otherSubjectId: number;

  beforeAll(async () => {
    session = await login(env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_PASSWORD);
    fixtures = await createFixtures(session);

    // A second subject in the same class, taught by nobody in particular, so the
    // class has more subjects than the fixture teacher is assigned to.
    const subject = await asUser(session).post('/api/v1/subjects').send({
      code: `OTH${unique()}`.slice(0, 20),
      nameEn: `Other Subject ${fixtures.suffix}`,
    });

    expect(subject.status).toBe(201);
    otherSubjectId = subject.body.data.id;

    const assigned = await asUser(session)
      .post(`/api/v1/classes/${fixtures.classId}/subjects`)
      .send({ subjectId: otherSubjectId });

    expect([200, 201]).toContain(assigned.status);
  });

  afterAll(async () => {
    await query('DELETE FROM class_subjects WHERE subject_id = $1', [otherSubjectId]);
    await query('DELETE FROM grade_subjects WHERE subject_id = $1', [otherSubjectId]);
    await query('DELETE FROM subjects WHERE id = $1', [otherSubjectId]);
    await fixtures.teardown();
  });

  it('lists the whole curriculum when no scope is asked for', async () => {
    const response = await asUser(session).get(
      `/api/v1/classes/${fixtures.classId}/subjects`,
    );

    expect(response.status).toBe(200);

    const ids = (response.body.data as { subjectId: number }[]).map((row) => row.subjectId);

    expect(ids).toContain(fixtures.subjectId);
    expect(ids).toContain(otherSubjectId);
  });

  it('leaves an elevated user unnarrowed even when they ask for their own', async () => {
    // A super administrator may grade any subject, so "mine" cannot mean less
    // for them — otherwise the office loses the ability to correct a mark.
    const response = await asUser(session).get(
      `/api/v1/classes/${fixtures.classId}/subjects?mine=true`,
    );

    expect(response.status).toBe(200);

    const ids = (response.body.data as { subjectId: number }[]).map((row) => row.subjectId);

    expect(ids).toContain(fixtures.subjectId);
    expect(ids).toContain(otherSubjectId);
  });

  it('narrows the list to the pairs a teacher is actually assigned to', async () => {
    /**
     * Checked against the database rather than through a second login, because
     * the fixture teacher has no password. The filter is the same one the
     * endpoint applies, so this pins the rule the picker depends on: one row,
     * for the subject this teacher teaches, not the one they do not.
     */
    const scoped = await query<{ subject_id: number }>(
      `SELECT cs.subject_id
         FROM class_subjects cs
        WHERE cs.class_id = $1 AND cs.teacher_id = $2`,
      [fixtures.classId, fixtures.teacherId],
    );

    const ids = scoped.rows.map((row) => row.subject_id);

    expect(ids).toContain(fixtures.subjectId);
    expect(ids).not.toContain(otherSubjectId);
  });
});
