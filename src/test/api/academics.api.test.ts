import { afterAll, beforeAll, expect, it } from 'vitest';
import { asUser, cleanup, describeApi, login } from '../integration';
import type { Session } from '../integration';
import { createEnrolledStudent, createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';

describeApi('enrollment API', () => {
  let session: Session;
  let fixtures: Fixtures;
  let secondClassId: number;
  const studentIds: number[] = [];

  beforeAll(async () => {
    session = await login();
    fixtures = await createFixtures(session);

    const second = await asUser(session).post('/api/v1/classes').send({
      academicYearId: fixtures.academicYearId,
      gradeLevelId: fixtures.gradeLevelId,
      code: `TC${fixtures.suffix}B`,
      name: `Test Class B ${fixtures.suffix}`,
      capacity: 40,
    });
    secondClassId = second.body.data.id;
  });

  afterAll(async () => {
    await cleanup({ studentIds, classIds: [secondClassId] });
    await fixtures.teardown();
  });

  it('enrolls a student into a class for a given academic year', async () => {
    const student = await asUser(session).post('/api/v1/students').send({
      firstNameEn: 'Enroll',
      lastNameEn: `Me ${fixtures.suffix}`,
    });
    studentIds.push(student.body.data.id);

    const response = await asUser(session).post('/api/v1/enrollments').send({
      studentId: student.body.data.id,
      academicYearId: fixtures.academicYearId,
      classId: fixtures.classId,
      rollNumber: '01',
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      classId: fixtures.classId,
      academicYearId: fixtures.academicYearId,
      status: 'ACTIVE',
    });
  });

  it('refuses a second active enrollment in the same academic year', async () => {
    const response = await asUser(session).post('/api/v1/enrollments').send({
      studentId: studentIds[0],
      academicYearId: fixtures.academicYearId,
      classId: secondClassId,
    });

    expect(response.status).toBe(409);
  });

  it('transfers a student to another class and keeps the previous enrollment as history', async () => {
    const { studentId } = await createEnrolledStudent(session, fixtures, 'Transfer');
    studentIds.push(studentId);

    const before = await asUser(session).get(`/api/v1/students/${studentId}/enrollments`);
    const enrollmentId: number = before.body.data[0].id;

    const transfer = await asUser(session)
      .post(`/api/v1/enrollments/${enrollmentId}/transfer`)
      .send({ classId: secondClassId, effectiveDate: `${fixtures.year}-11-01` });

    expect(transfer.status).toBeLessThan(300);

    const after = await asUser(session).get(`/api/v1/students/${studentId}/enrollments`);

    // The history is preserved: the old row is closed, a new active row is added.
    expect(after.body.data.length).toBe(2);
    expect(after.body.data.filter((row: { status: string }) => row.status === 'ACTIVE')).toHaveLength(
      1,
    );
    expect(
      after.body.data.find((row: { status: string }) => row.status === 'ACTIVE').classId,
    ).toBe(secondClassId);
  });

  it('withdraws a student, leaving no active enrollment', async () => {
    const { studentId } = await createEnrolledStudent(session, fixtures, 'Withdraw');
    studentIds.push(studentId);

    const before = await asUser(session).get(`/api/v1/students/${studentId}/enrollments`);
    const enrollmentId: number = before.body.data[0].id;

    const withdraw = await asUser(session)
      .post(`/api/v1/enrollments/${enrollmentId}/withdraw`)
      .send({ endDate: `${fixtures.year}-12-01`, status: 'WITHDRAWN' });

    expect(withdraw.status).toBeLessThan(300);

    const current = await asUser(session).get(
      `/api/v1/students/${studentId}/enrollments/current`,
    );
    expect([404, 200]).toContain(current.status);

    if (current.status === 200) {
      expect(current.body.data).toBeNull();
    }
  });

  it('lists the students of a class', async () => {
    const response = await asUser(session).get(`/api/v1/classes/${fixtures.classId}/students`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('rejects an enrollment into a class of a different academic year', async () => {
    const otherYear = await asUser(session).post('/api/v1/academic-years').send({
      name: `Other Year ${fixtures.suffix}`,
      startDate: `${fixtures.year + 1}-09-01`,
      endDate: `${fixtures.year + 2}-07-31`,
    });

    const student = await asUser(session).post('/api/v1/students').send({
      firstNameEn: 'Mismatch',
      lastNameEn: `Year ${fixtures.suffix}`,
    });
    studentIds.push(student.body.data.id);

    const response = await asUser(session).post('/api/v1/enrollments').send({
      studentId: student.body.data.id,
      academicYearId: otherYear.body.data.id,
      classId: fixtures.classId,
    });

    expect(response.status).toBeGreaterThanOrEqual(400);

    await cleanup({ academicYearIds: [otherYear.body.data.id] });
  });
});

describeApi('schedule conflict detection', () => {
  let session: Session;
  let fixtures: Fixtures;
  let secondClassId: number;
  const scheduleIds: number[] = [];

  beforeAll(async () => {
    session = await login();
    fixtures = await createFixtures(session);

    const second = await asUser(session).post('/api/v1/classes').send({
      academicYearId: fixtures.academicYearId,
      gradeLevelId: fixtures.gradeLevelId,
      code: `SC${fixtures.suffix}B`,
      name: `Schedule Class B ${fixtures.suffix}`,
      subjects: [{ subjectId: fixtures.subjectId, teacherId: fixtures.teacherId }],
    });
    secondClassId = second.body.data.id;
  });

  afterAll(async () => {
    await cleanup({ scheduleIds, classIds: [secondClassId] });
    await fixtures.teardown();
  });

  it('creates a lesson in a free slot', async () => {
    const response = await asUser(session).post('/api/v1/schedules').send({
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      teacherId: fixtures.teacherId,
      roomId: fixtures.roomId,
      dayOfWeek: 'MONDAY',
      periodNumber: 1,
      startTime: '07:30',
      endTime: '08:15',
    });

    expect(response.status).toBe(201);
    scheduleIds.push(response.body.data.schedule?.id ?? response.body.data.id);
  });

  it('rejects a second lesson for the same class at an overlapping time', async () => {
    const response = await asUser(session).post('/api/v1/schedules').send({
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      dayOfWeek: 'MONDAY',
      startTime: '08:00',
      endTime: '08:45',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SCHEDULE_CONFLICT');
  });

  it('rejects the same teacher being booked twice at once, even in another class', async () => {
    const response = await asUser(session).post('/api/v1/schedules').send({
      classId: secondClassId,
      subjectId: fixtures.subjectId,
      teacherId: fixtures.teacherId,
      dayOfWeek: 'MONDAY',
      startTime: '07:45',
      endTime: '08:30',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SCHEDULE_CONFLICT');
  });

  it('reports a room clash as an overridable warning', async () => {
    const blocked = await asUser(session).post('/api/v1/schedules').send({
      classId: secondClassId,
      subjectId: fixtures.subjectId,
      roomId: fixtures.roomId,
      dayOfWeek: 'MONDAY',
      startTime: '07:45',
      endTime: '08:30',
    });

    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SCHEDULE_ROOM_CONFLICT');

    const forced = await asUser(session).post('/api/v1/schedules').send({
      classId: secondClassId,
      subjectId: fixtures.subjectId,
      roomId: fixtures.roomId,
      dayOfWeek: 'MONDAY',
      startTime: '07:45',
      endTime: '08:30',
      ignoreWarnings: true,
    });

    expect(forced.status).toBe(201);
    scheduleIds.push(forced.body.data.schedule?.id ?? forced.body.data.id);
  });

  it('allows the same room at a non-overlapping time', async () => {
    const response = await asUser(session).post('/api/v1/schedules').send({
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      roomId: fixtures.roomId,
      dayOfWeek: 'MONDAY',
      startTime: '09:00',
      endTime: '09:45',
    });

    expect(response.status).toBe(201);
    scheduleIds.push(response.body.data.schedule?.id ?? response.body.data.id);
  });

  it('allows the same slot on a different weekday', async () => {
    const response = await asUser(session).post('/api/v1/schedules').send({
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      teacherId: fixtures.teacherId,
      dayOfWeek: 'TUESDAY',
      startTime: '07:30',
      endTime: '08:15',
    });

    expect(response.status).toBe(201);
    scheduleIds.push(response.body.data.schedule?.id ?? response.body.data.id);
  });

  it('rejects an end time that is not after the start time', async () => {
    const response = await asUser(session).post('/api/v1/schedules').send({
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      dayOfWeek: 'FRIDAY',
      startTime: '10:00',
      endTime: '09:00',
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it('previews conflicts without writing anything', async () => {
    const response = await asUser(session).post('/api/v1/schedules/check-conflicts').send({
      classId: fixtures.classId,
      dayOfWeek: 'MONDAY',
      startTime: '07:30',
      endTime: '08:15',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.conflicts.length).toBeGreaterThan(0);
    expect(response.body.data.conflicts[0].kind).toBe('CLASS');
  });
});
