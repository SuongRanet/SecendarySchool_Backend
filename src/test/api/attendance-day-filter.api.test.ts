import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../../config';
import { asUser, describeApi, login } from '../integration';
import { createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';
import type { Session } from '../integration';

/**
 * The dashboard's attendance panel used to read `CURRENT_DATE` and nothing else.
 *
 * A register is taken during the morning, so before it is, today is legitimately
 * empty — and a panel that can only ever show today then reads as though nobody
 * had come to school. Worse, it cannot tell that state apart from a day the
 * register genuinely recorded no one. Choosing the day fixes both: yesterday's
 * completed register is one click away, and "not taken yet" becomes visible as
 * itself.
 */
describeApi('attendance can be read for a chosen day', () => {
  let session: Session;
  let fixtures: Fixtures;

  beforeAll(async () => {
    session = await login(env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_PASSWORD);
    // `spanToday` puts the fixture's year around today, which is what lets
    // attendance be recorded at all: the API refuses a future date.
    fixtures = await createFixtures(session, { spanToday: true });

    const student = await asUser(session).post('/api/v1/students').send({
      firstNameEn: 'Register',
      lastNameEn: `Test ${fixtures.suffix}`,
      enrollment: { academicYearId: fixtures.academicYearId, classId: fixtures.classId },
    });

    const studentId: number = student.body.data.id;

    // One day marked present, an adjacent one left untouched.
    const recorded = await asUser(session).post('/api/v1/attendance').send({
      classId: fixtures.classId,
      attendanceDate: fixtures.dayOne,
      entries: [{ studentId, status: 'PRESENT' }],
    });

    expect([200, 201]).toContain(recorded.status);
  });

  afterAll(async () => {
    await fixtures.teardown();
  });

  it('reports the day that was asked for, and says which day it is', async () => {
    const response = await asUser(session).get(
      `/api/v1/attendance/today?academicYearId=${fixtures.academicYearId}&date=${fixtures.dayOne}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.date).toBe(fixtures.dayOne);
    expect(response.body.data.present).toBeGreaterThanOrEqual(1);
  });

  it('separates a day with no register from a day where nobody attended', async () => {
    const response = await asUser(session).get(
      `/api/v1/attendance/today?academicYearId=${fixtures.academicYearId}&date=${fixtures.dayTwo}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.date).toBe(fixtures.dayTwo);

    // Nothing was recorded, so every pupil is outstanding rather than absent.
    expect(response.body.data.totalRecords).toBe(0);
    expect(response.body.data.absent).toBe(0);
    expect(response.body.data.notRecorded).toBeGreaterThanOrEqual(1);
  });

  it('falls back to today when no day is named', async () => {
    const response = await asUser(session).get(
      `/api/v1/attendance/today?academicYearId=${fixtures.academicYearId}`,
    );

    const today = new Date();
    const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);

    expect(response.status).toBe(200);
    expect(response.body.data.date).toBe(local.toISOString().slice(0, 10));
  });

  it('rejects a date that is not a date', async () => {
    const response = await asUser(session).get(
      '/api/v1/dashboard/admin?date=last%20tuesday',
    );

    // Validation failures are 422 throughout this API, not 400.
    expect(response.status).toBe(422);
  });
});
