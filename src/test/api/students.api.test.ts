import { afterAll, beforeAll, expect, it } from 'vitest';
import { asUser, cleanup, closeDatabase, describeApi, login, unique } from '../integration';
import type { Session } from '../integration';
import { createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';

describeApi('student and guardian API', () => {
  let session: Session;
  let fixtures: Fixtures;
  const studentIds: number[] = [];
  const parentIds: number[] = [];

  beforeAll(async () => {
    session = await login();
    fixtures = await createFixtures(session);
  });

  afterAll(async () => {
    await cleanup({ studentIds, parentIds });
    await fixtures.teardown();
    await closeDatabase();
  });

  it('creates a student and allocates a student code', async () => {
    const response = await asUser(session).post('/api/v1/students').send({
      firstNameEn: 'Sophea',
      lastNameEn: `Sok ${fixtures.suffix}`,
      gender: 'FEMALE',
      dateOfBirth: '2016-02-11',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.studentCode).toEqual(expect.any(String));
    expect(response.body.data.firstNameEn).toBe('Sophea');

    studentIds.push(response.body.data.id);
  });

  it('rejects a student with no name', async () => {
    const response = await asUser(session)
      .post('/api/v1/students')
      .send({ firstNameEn: '', lastNameEn: '' });

    expect(response.status).toBe(422);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it('rejects a malformed date of birth', async () => {
    const response = await asUser(session).post('/api/v1/students').send({
      firstNameEn: 'Bad',
      lastNameEn: 'Date',
      dateOfBirth: '11/02/2016',
    });

    expect(response.status).toBe(422);
  });

  it('reads a student back by id', async () => {
    const response = await asUser(session).get(`/api/v1/students/${studentIds[0]}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(studentIds[0]);
  });

  it('answers 404 for a student that does not exist', async () => {
    const response = await asUser(session).get('/api/v1/students/99999999');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('STUDENT_NOT_FOUND');
  });

  it('updates a student', async () => {
    const response = await asUser(session)
      .patch(`/api/v1/students/${studentIds[0]}`)
      .send({ province: 'Siem Reap' });

    expect(response.status).toBe(200);
    expect(response.body.data.province).toBe('Siem Reap');
  });

  it('paginates the list and reports the meta', async () => {
    const response = await asUser(session).get('/api/v1/students?page=1&limit=5');

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeLessThanOrEqual(5);
    expect(response.body.pagination).toMatchObject({ page: 1, limit: 5 });
    expect(response.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('searches by name on the server', async () => {
    const response = await asUser(session).get(
      `/api/v1/students?search=${encodeURIComponent(`Sok ${fixtures.suffix}`)}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { id: number }) => row.id)).toContain(studentIds[0]);
  });

  it('creates a student together with an enrollment', async () => {
    const response = await asUser(session)
      .post('/api/v1/students')
      .send({
        firstNameEn: 'Dara',
        lastNameEn: `Chan ${fixtures.suffix}`,
        enrollment: { academicYearId: fixtures.academicYearId, classId: fixtures.classId },
      });

    expect(response.status).toBe(201);
    studentIds.push(response.body.data.id);

    const enrollments = await asUser(session).get(
      `/api/v1/students/${response.body.data.id}/enrollments`,
    );

    expect(enrollments.body.data).toHaveLength(1);
    expect(enrollments.body.data[0]).toMatchObject({
      classId: fixtures.classId,
      academicYearId: fixtures.academicYearId,
      status: 'ACTIVE',
    });
  });

  it('links a guardian to a student and reads the relationship from both sides', async () => {
    const parent = await asUser(session).post('/api/v1/parents').send({
      firstNameEn: 'Bopha',
      lastNameEn: `Chan ${fixtures.suffix}`,
      phoneNumber: '012345678',
    });

    expect(parent.status).toBe(201);
    parentIds.push(parent.body.data.id);

    const link = await asUser(session)
      .post(`/api/v1/students/${studentIds[1]}/parents`)
      .send({ parentId: parent.body.data.id, relationship: 'MOTHER', isPrimaryContact: true });

    expect(link.status).toBeLessThan(300);

    const fromStudent = await asUser(session).get(`/api/v1/students/${studentIds[1]}/parents`);
    expect(fromStudent.body.data.map((row: { id: number }) => row.id)).toContain(
      parent.body.data.id,
    );

    const fromParent = await asUser(session).get(
      `/api/v1/parents/${parent.body.data.id}/children`,
    );
    expect(fromParent.body.data.map((row: { id: number }) => row.id)).toContain(studentIds[1]);
  });

  it('lets one guardian hold several children', async () => {
    const link = await asUser(session)
      .post(`/api/v1/students/${studentIds[0]}/parents`)
      .send({ parentId: parentIds[0], relationship: 'MOTHER' });

    expect(link.status).toBeLessThan(300);

    const children = await asUser(session).get(`/api/v1/parents/${parentIds[0]}/children`);
    expect(children.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('unlinks a guardian without deleting either record', async () => {
    const unlink = await asUser(session).delete(
      `/api/v1/students/${studentIds[0]}/parents/${parentIds[0]}`,
    );

    expect(unlink.status).toBeLessThan(300);

    const children = await asUser(session).get(`/api/v1/parents/${parentIds[0]}/children`);
    expect(children.body.data.map((row: { id: number }) => row.id)).not.toContain(studentIds[0]);

    const student = await asUser(session).get(`/api/v1/students/${studentIds[0]}`);
    expect(student.status).toBe(200);
  });

  it('soft deletes a student and restores it, keeping the same record', async () => {
    const throwaway = await asUser(session).post('/api/v1/students').send({
      firstNameEn: 'Temporary',
      lastNameEn: `Record ${unique()}`,
    });
    const id: number = throwaway.body.data.id;
    studentIds.push(id);

    const archived = await asUser(session).delete(`/api/v1/students/${id}`);
    expect(archived.status).toBeLessThan(300);

    const afterDelete = await asUser(session).get(`/api/v1/students?search=Temporary`);
    expect(afterDelete.body.data.map((row: { id: number }) => row.id)).not.toContain(id);

    const restored = await asUser(session).post(`/api/v1/students/${id}/restore`);
    expect(restored.status).toBeLessThan(300);

    const afterRestore = await asUser(session).get(`/api/v1/students/${id}`);
    expect(afterRestore.status).toBe(200);
    expect(afterRestore.body.data.firstNameEn).toBe('Temporary');
  });
});
