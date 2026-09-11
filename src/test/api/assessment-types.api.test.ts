import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../../config';
import { asUser, describeApi, login } from '../integration';
import { query } from '../../database/connection';
import { createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';
import type { Session } from '../integration';

/**
 * The school assesses on quizzes, the midterm and the final. Nothing else may be
 * created.
 *
 * The restriction is on creating, not on saving. Three hundred and forty
 * homework assessments already exist, they carry ten per cent of every subject
 * grade, and the mark a teacher gives on the Homework page reaches the gradebook
 * through one of them. Refusing to save those would make every one uneditable
 * and strand the marks behind them, so an existing type stays valid on update.
 *
 * ASSIGNMENT, PROJECT and PARTICIPATION were never used and are gone entirely.
 */
describeApi('assessments are limited to quiz, midterm and final', () => {
  let session: Session;
  let fixtures: Fixtures;
  const created: number[] = [];

  beforeAll(async () => {
    session = await login(env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_PASSWORD);
    fixtures = await createFixtures(session);
  });

  afterAll(async () => {
    for (const id of created) {
      await query('DELETE FROM assessment_results WHERE assessment_id = $1', [id]);
      await query('DELETE FROM assessments WHERE id = $1', [id]);
    }

    await fixtures.teardown();
  });

  const create = (type: string) =>
    asUser(session).post('/api/v1/assessments').send({
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      title: `Type check ${type} ${fixtures.suffix}`,
      type,
      maxScore: 20,
      assessmentDate: fixtures.dayOne,
    });

  it.each(['QUIZ', 'MIDTERM', 'FINAL'])('accepts %s', async (type) => {
    const response = await create(type);

    expect(response.status).toBe(201);
    created.push(response.body.data.id);
  });

  it.each(['HOMEWORK', 'ASSIGNMENT', 'PROJECT', 'PARTICIPATION'])(
    'refuses to create %s',
    async (type) => {
      const response = await create(type);

      // Validation, not a silent coercion to some default type.
      expect(response.status).toBe(422);
    },
  );

  it('still saves an assessment that is already homework', async () => {
    /**
     * Inserted directly, because the API can no longer produce one — which is
     * the whole point. What matters is that the ones already on file remain
     * editable rather than becoming read-only relics.
     */
    const existing = await query<{ id: number }>(
      `INSERT INTO assessments (academic_year_id, class_id, subject_id, title, type, max_score,
                                assessment_date, is_published)
       VALUES ($1, $2, $3, $4, 'HOMEWORK', 20, $5, TRUE)
       RETURNING id`,
      [
        fixtures.academicYearId,
        fixtures.classId,
        fixtures.subjectId,
        `Legacy homework ${fixtures.suffix}`,
        fixtures.dayOne,
      ],
    );

    const id = existing.rows[0].id;
    created.push(id);

    const response = await asUser(session)
      .patch(`/api/v1/assessments/${id}`)
      .send({ type: 'HOMEWORK', maxScore: 25 });

    expect(response.status).toBe(200);
    expect(response.body.data.type).toBe('HOMEWORK');
  });
});
