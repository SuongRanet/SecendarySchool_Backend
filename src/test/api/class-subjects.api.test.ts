import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../../config';
import { asUser, describeApi, login } from '../integration';
import { createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';
import type { Session } from '../integration';

/**
 * Changing who teaches a subject must carry the timetable with it. The
 * assignment and the periods are two records of the same fact, and letting them
 * drift showed one teacher on the class list and another on the timetable.
 */
describeApi('class subject teacher reassignment', () => {
  let session: Session;
  let fixtures: Fixtures;
  let secondTeacherId: number;

  beforeAll(async () => {
    session = await login(env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_PASSWORD);
    fixtures = await createFixtures(session);

    const teacher = await asUser(session)
      .post('/api/v1/teachers')
      .send({ firstNameEn: 'Second', lastNameEn: `Teacher ${fixtures.suffix}` });

    secondTeacherId = teacher.body.data.id;
  });

  afterAll(async () => {
    await fixtures.teardown();
  });

  it('moves the timetable onto the teacher now responsible for the subject', async () => {
    // A period taught by the original teacher.
    const period = await asUser(session).post('/api/v1/schedules').send({
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      teacherId: fixtures.teacherId,
      roomId: fixtures.roomId,
      dayOfWeek: 'MONDAY',
      periodNumber: 1,
      startTime: '07:00',
      endTime: '07:45',
    });

    expect(period.status).toBe(201);

    // Hand the subject to somebody else.
    const reassigned = await asUser(session)
      .post(`/api/v1/classes/${fixtures.classId}/subjects`)
      .send({ subjectId: fixtures.subjectId, teacherId: secondTeacherId });

    expect(reassigned.status).toBeLessThan(300);

    const schedule = await asUser(session).get(
      `/api/v1/schedules?classId=${fixtures.classId}&isActive=true`,
    );

    const moved = schedule.body.data.filter(
      (row: { subjectId: number }) => row.subjectId === fixtures.subjectId,
    );

    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every((row: { teacherId: number }) => row.teacherId === secondTeacherId)).toBe(true);
  });

  it('refuses the change when the incoming teacher is already teaching elsewhere', async () => {
    // A second class where the second teacher is busy at the same hour.
    const otherClass = await asUser(session).post('/api/v1/classes').send({
      academicYearId: fixtures.academicYearId,
      gradeLevelId: fixtures.gradeLevelId,
      code: `Z${fixtures.suffix}`,
      name: `Clash ${fixtures.suffix}`,
      capacity: 30,
    });

    expect(otherClass.status).toBe(201);

    await asUser(session)
      .post(`/api/v1/classes/${otherClass.body.data.id}/subjects`)
      .send({ subjectId: fixtures.subjectId, teacherId: fixtures.teacherId });

    await asUser(session).post('/api/v1/schedules').send({
      classId: otherClass.body.data.id,
      subjectId: fixtures.subjectId,
      teacherId: fixtures.teacherId,
      dayOfWeek: 'MONDAY',
      periodNumber: 1,
      startTime: '07:00',
      endTime: '07:45',
      ignoreWarnings: true,
    });

    // The original teacher now clashes with themselves at Monday period 1.
    const refused = await asUser(session)
      .post(`/api/v1/classes/${fixtures.classId}/subjects`)
      .send({ subjectId: fixtures.subjectId, teacherId: fixtures.teacherId });

    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('TEACHER_SCHEDULE_CONFLICT');

    await asUser(session).delete(`/api/v1/classes/${otherClass.body.data.id}`);
  });
});
