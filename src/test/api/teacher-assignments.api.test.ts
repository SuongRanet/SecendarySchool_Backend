import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../../config';
import { asUser, describeApi, login } from '../integration';
import { createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';
import type { Session } from '../integration';

/**
 * A homeroom teacher is responsible for their class whether or not they happen
 * to teach a subject in it: they take its register and write its report card
 * comments. Two of the school's eight homeroom teachers teach nothing in their
 * own class, and their class was missing from "My Classes" entirely — while the
 * dashboard, which counted homerooms correctly, showed a larger number. The two
 * screens disagreed and the teacher could not open their own class.
 */
describeApi('teacher assignments include homeroom classes', () => {
  let session: Session;
  let fixtures: Fixtures;
  let homeroomOnlyTeacherId: number;
  let secondClassId: number;

  beforeAll(async () => {
    session = await login(env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_PASSWORD);
    fixtures = await createFixtures(session);

    // A teacher who teaches nothing anywhere.
    const teacher = await asUser(session)
      .post('/api/v1/teachers')
      .send({ firstNameEn: 'Homeroom', lastNameEn: `Only ${fixtures.suffix}` });

    homeroomOnlyTeacherId = teacher.body.data.id;

    // ...and a class they lead but do not teach in. The class gets its subject
    // from the fixture's own teacher, so the homeroom teacher has no
    // class_subject row anywhere in it.
    const created = await asUser(session).post('/api/v1/classes').send({
      academicYearId: fixtures.academicYearId,
      gradeLevelId: fixtures.gradeLevelId,
      code: `HR${fixtures.suffix}`,
      name: `Homeroom Class ${fixtures.suffix}`,
      homeroomTeacherId: homeroomOnlyTeacherId,
      capacity: 40,
      subjects: [{ subjectId: fixtures.subjectId, teacherId: fixtures.teacherId }],
    });

    expect(created.status).toBe(201);
    secondClassId = created.body.data.id;
  });

  afterAll(async () => {
    await asUser(session).delete(`/api/v1/classes/${secondClassId}`);
    await asUser(session).delete(`/api/v1/teachers/${homeroomOnlyTeacherId}`);
    await fixtures.teardown();
  });

  it('lists a homeroom class the teacher teaches no subject in', async () => {
    const response = await asUser(session).get(
      `/api/v1/teachers/${homeroomOnlyTeacherId}/assignments`,
    );

    expect(response.status).toBe(200);

    const rows = response.body.data as {
      classId: number;
      isHomeroom: boolean;
      subjectId: number | null;
      subjectName: string | null;
      classSubjectId: number | null;
    }[];

    const homeroom = rows.find((row) => row.classId === secondClassId);

    expect(homeroom).toBeDefined();
    expect(homeroom?.isHomeroom).toBe(true);

    // Nothing is taught there, so the row carries no subject.
    expect(homeroom?.subjectId).toBeNull();
    expect(homeroom?.subjectName).toBeNull();
    expect(homeroom?.classSubjectId).toBeNull();
  });

  it('counts the same classes as the dashboard', async () => {
    const assignments = await asUser(session).get(
      `/api/v1/teachers/${homeroomOnlyTeacherId}/assignments`,
    );

    const distinctClasses = new Set(
      (assignments.body.data as { classId: number }[]).map((row) => row.classId),
    );

    // The dashboard counts a class when the teacher leads it or teaches in it.
    // The assignment list has to agree, or the two screens contradict.
    expect(distinctClasses.size).toBe(1);
  });

  it('still returns one row per subject for a teacher who does teach', async () => {
    const response = await asUser(session).get(
      `/api/v1/teachers/${fixtures.teacherId}/assignments`,
    );

    expect(response.status).toBe(200);

    const taught = (response.body.data as { subjectId: number | null; classId: number }[]).filter(
      (row) => row.subjectId === fixtures.subjectId,
    );

    // The fixture teacher teaches the subject in both classes and leads neither,
    // so no extra homeroom row may appear for them.
    expect(taught.length).toBe(2);
    expect(taught.map((row) => row.classId).sort()).toEqual(
      [fixtures.classId, secondClassId].sort(),
    );
  });
});
