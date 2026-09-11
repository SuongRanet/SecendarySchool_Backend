import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../../config';
import { asUser, describeApi, login } from '../integration';
import { query } from '../../database/connection';
import { createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';
import type { Session } from '../integration';

/**
 * Homework only works as a conversation if it travels both ways.
 *
 * Publishing an assignment already reached the class, but the two replies
 * reached nobody: a teacher had to open each assignment and count what had
 * arrived to discover a pupil had handed in, and a pupil had no way of learning
 * their work had been marked short of checking every day. Both notifications
 * were missing, and the notification table itself was being written to by
 * announcements while no screen in the application read it.
 */
describeApi('homework notifies the other side', () => {
  let session: Session;
  let fixtures: Fixtures;
  let studentId: number;
  let assignmentId: number;
  let teacherUserId: number | null;

  beforeAll(async () => {
    session = await login(env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_PASSWORD);
    fixtures = await createFixtures(session, { spanToday: true });

    const student = await asUser(session).post('/api/v1/students').send({
      firstNameEn: 'Homework',
      lastNameEn: `Pupil ${fixtures.suffix}`,
      enrollment: { academicYearId: fixtures.academicYearId, classId: fixtures.classId },
    });

    studentId = student.body.data.id;

    // The pupil needs a login, because a notification is delivered to a user
    // rather than to a student record.
    await query(
      `INSERT INTO users (username, email, password_hash, status)
       VALUES ($1, $2, '$2b$12$notarealhashnotarealhashnotarealhashnotarealhash', 'ACTIVE')
       ON CONFLICT DO NOTHING`,
      [`pupil${fixtures.suffix}`.toLowerCase(), `pupil${fixtures.suffix}@school.local`],
    );

    await query(
      `UPDATE students SET user_id = (SELECT id FROM users WHERE username = $2) WHERE id = $1`,
      [studentId, `pupil${fixtures.suffix}`.toLowerCase()],
    );

    /**
     * The teacher needs a login too. A notification is delivered to a user, so a
     * teacher recorded on the staff roll but never given an account simply is
     * not notified — correct behaviour, but it would make this test pass by
     * finding nothing rather than by finding the right thing.
     */
    await query(
      `INSERT INTO users (username, email, password_hash, status)
       VALUES ($1, $2, '$2b$12$notarealhashnotarealhashnotarealhashnotarealhash', 'ACTIVE')
       ON CONFLICT DO NOTHING`,
      [`staff${fixtures.suffix}`.toLowerCase(), `staff${fixtures.suffix}@school.local`],
    );

    await query(
      `UPDATE teachers SET user_id = (SELECT id FROM users WHERE username = $2) WHERE id = $1`,
      [fixtures.teacherId, `staff${fixtures.suffix}`.toLowerCase()],
    );

    const teacher = await query<{ user_id: number | null }>(
      'SELECT user_id FROM teachers WHERE id = $1',
      [fixtures.teacherId],
    );

    teacherUserId = teacher.rows[0]?.user_id ?? null;
    expect(teacherUserId).not.toBeNull();

    const assignment = await asUser(session).post('/api/v1/assignments').send({
      academicYearId: fixtures.academicYearId,
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      teacherId: fixtures.teacherId,
      title: `Chapter questions ${fixtures.suffix}`,
      assignedDate: fixtures.dayOne,
      dueDate: fixtures.rangeTo,
      maxScore: 20,
      status: 'PUBLISHED',
    });

    expect(assignment.status).toBe(201);
    assignmentId = assignment.body.data.id;

    // Created assignments start as drafts, and a draft is not open for
    // submission — which is the point of the state.
    const published = await asUser(session).post(`/api/v1/assignments/${assignmentId}/publish`);

    expect(published.status).toBe(200);

    // The assignment has to record its teacher, or there is nobody to tell.
    const stored = await query<{ teacher_id: number | null; status: string }>(
      'SELECT teacher_id, status::text FROM assignments WHERE id = $1',
      [assignmentId],
    );

    expect(stored.rows[0]).toMatchObject({
      teacher_id: fixtures.teacherId,
      status: 'PUBLISHED',
    });
  });

  afterAll(async () => {
    await query(
      `DELETE FROM notification_recipients WHERE notification_id IN
         (SELECT id FROM notifications WHERE entity_type = 'assignment' AND entity_id = $1)`,
      [assignmentId],
    );
    await query(
      `DELETE FROM notifications WHERE entity_type = 'assignment' AND entity_id = $1`,
      [assignmentId],
    );
    await query('DELETE FROM submissions WHERE assignment_id = $1', [assignmentId]);
    await query('DELETE FROM assignments WHERE id = $1', [assignmentId]);
    await query('DELETE FROM enrollments WHERE student_id = $1', [studentId]);

    const user = await query<{ user_id: number | null }>(
      'SELECT user_id FROM students WHERE id = $1',
      [studentId],
    );

    await query('UPDATE students SET user_id = NULL WHERE id = $1', [studentId]);
    await query('DELETE FROM students WHERE id = $1', [studentId]);

    if (user.rows[0]?.user_id) {
      await query('DELETE FROM notification_recipients WHERE user_id = $1', [user.rows[0].user_id]);
      await query('DELETE FROM users WHERE id = $1', [user.rows[0].user_id]);
    }

    if (teacherUserId) {
      await query('UPDATE teachers SET user_id = NULL WHERE id = $1', [fixtures.teacherId]);
      await query('DELETE FROM notification_recipients WHERE user_id = $1', [teacherUserId]);
      await query('DELETE FROM users WHERE id = $1', [teacherUserId]);
    }

    await fixtures.teardown();
  });

  it('tells the teacher when a pupil hands work in', async () => {
    const response = await asUser(session)
      .post(`/api/v1/assignments/${assignmentId}/submit`)
      .send({ studentId, content: 'My answers to chapter four.' });

    expect([200, 201]).toContain(response.status);

    const delivered = await query<{ title: string; user_id: number }>(
      `SELECT n.title, nr.user_id
         FROM notifications n
         JOIN notification_recipients nr ON nr.notification_id = n.id
        WHERE n.type = 'HOMEWORK_SUBMITTED' AND n.entity_id = $1`,
      [assignmentId],
    );

    expect(delivered.rowCount).toBeGreaterThanOrEqual(1);
    expect(delivered.rows[0].title).toContain('handed in');

    if (teacherUserId) {
      expect(delivered.rows.map((row) => row.user_id)).toContain(teacherUserId);
    }
  });

  it('tells the pupil when their work is marked, and nobody else', async () => {
    const response = await asUser(session)
      .put(`/api/v1/assignments/${assignmentId}/submissions`)
      .send({ results: [{ studentId, score: 17, feedback: 'Clear working.' }] });

    expect(response.status).toBe(200);

    const delivered = await query<{ title: string; body: string; user_id: number }>(
      `SELECT n.title, n.body, nr.user_id
         FROM notifications n
         JOIN notification_recipients nr ON nr.notification_id = n.id
        WHERE n.type = 'HOMEWORK_GRADED' AND n.entity_id = $1`,
      [assignmentId],
    );

    expect(delivered.rowCount).toBe(1);
    expect(delivered.rows[0].body).toContain('17');

    // A mark is the pupil's own business: it must not fan out to the class.
    const pupilUser = await query<{ user_id: number }>(
      'SELECT user_id FROM students WHERE id = $1',
      [studentId],
    );

    expect(delivered.rows[0].user_id).toBe(pupilUser.rows[0].user_id);
  });
});
