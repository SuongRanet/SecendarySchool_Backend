import { afterAll, beforeAll, expect, it } from 'vitest';
import { asUser, cleanup, describeApi, login } from '../integration';
import type { Session } from '../integration';
import { createEnrolledStudent, createFixtures } from '../fixtures';
import type { Fixtures } from '../fixtures';

describeApi('attendance API', () => {
  let session: Session;
  let fixtures: Fixtures;
  let studentId: number;
  let secondStudentId: number;
  const studentIds: number[] = [];
  const attendanceIds: number[] = [];

  beforeAll(async () => {
    session = await login();
    fixtures = await createFixtures(session, { spanToday: true });

    studentId = (await createEnrolledStudent(session, fixtures, 'Present')).studentId;
    secondStudentId = (await createEnrolledStudent(session, fixtures, 'Absent')).studentId;
    studentIds.push(studentId, secondStudentId);
  });

  afterAll(async () => {
    await cleanup({ attendanceIds, studentIds });
    await fixtures.teardown();
  });

  it('records a daily register for a whole class', async () => {
    const response = await asUser(session)
      .post('/api/v1/attendance')
      .send({
        classId: fixtures.classId,
        attendanceDate: fixtures.dayOne,
        entries: [
          { studentId, status: 'PRESENT' },
          { studentId: secondStudentId, status: 'ABSENT', note: 'Sick' },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toHaveLength(2);

    for (const row of response.body.data) {
      attendanceIds.push(row.id);
    }
  });

  it('reads the register back through the attendance sheet', async () => {
    const response = await asUser(session).get(
      `/api/v1/attendance/sheet?classId=${fixtures.classId}&date=${fixtures.dayOne}`,
    );

    expect(response.status).toBe(200);

    const marked = response.body.data.students.filter(
      (row: { attendance: { status: string } | null }) => row.attendance !== null,
    );

    expect(response.body.data.isRecorded).toBe(true);
    expect(marked.length).toBeGreaterThanOrEqual(2);
  });

  it('re-recording the same day corrects the register instead of duplicating it', async () => {
    const response = await asUser(session)
      .post('/api/v1/attendance')
      .send({
        classId: fixtures.classId,
        attendanceDate: fixtures.dayOne,
        entries: [{ studentId: secondStudentId, status: 'LATE', minutesLate: 12 }],
      });

    expect(response.status).toBe(201);

    const list = await asUser(session).get(
      `/api/v1/attendance?classId=${fixtures.classId}&dateFrom=${fixtures.dayOne}&dateTo=${fixtures.dayOne}&limit=50`,
    );

    expect(list.body.pagination.total).toBe(2);
    expect(
      list.body.data.find((row: { studentId: number }) => row.studentId === secondStudentId).status,
    ).toBe('LATE');
  });

  it('edits a single record', async () => {
    const update = await asUser(session)
      .patch(`/api/v1/attendance/${attendanceIds[0]}`)
      .send({ status: 'EXCUSED', note: 'Family event' });

    expect(update.status).toBe(200);
    expect(update.body.data.status).toBe('EXCUSED');

    await asUser(session)
      .patch(`/api/v1/attendance/${attendanceIds[0]}`)
      .send({ status: 'PRESENT', note: null });
  });

  it('rejects an unknown attendance status', async () => {
    const response = await asUser(session)
      .post('/api/v1/attendance')
      .send({
        classId: fixtures.classId,
        attendanceDate: fixtures.dayTwo,
        entries: [{ studentId, status: 'MAYBE' }],
      });

    expect(response.status).toBe(422);
  });

  it('rejects a register with no entries', async () => {
    const response = await asUser(session).post('/api/v1/attendance').send({
      classId: fixtures.classId,
      attendanceDate: fixtures.dayTwo,
      entries: [],
    });

    expect(response.status).toBe(422);
  });

  it('summarises a student, counting a late arrival as attending', async () => {
    const response = await asUser(session).get(
      `/api/v1/attendance/summary/student/${secondStudentId}?dateFrom=${fixtures.rangeFrom}&dateTo=${fixtures.rangeTo}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.totalRecords).toBe(1);
    expect(response.body.data.late).toBe(1);
    expect(response.body.data.attendanceRate).toBe(100);
  });

  it('summarises a class', async () => {
    const response = await asUser(session).get(
      `/api/v1/attendance/summary/class/${fixtures.classId}?dateFrom=${fixtures.rangeFrom}&dateTo=${fixtures.rangeTo}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.summary.totalRecords).toBeGreaterThanOrEqual(2);
    expect(response.body.data.summary.attendanceRate).toBeGreaterThanOrEqual(0);
    expect(response.body.data.summary.attendanceRate).toBeLessThanOrEqual(100);
    expect(Array.isArray(response.body.data.students)).toBe(true);
  });

  it('reports a daily trend for the academic year', async () => {
    const response = await asUser(session).get(
      `/api/v1/attendance/trend?academicYearId=${fixtures.academicYearId}` +
        `&classId=${fixtures.classId}&dateFrom=${fixtures.rangeFrom}&dateTo=${fixtures.rangeTo}`,
    );

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});

describeApi('grade calculation API', () => {
  let session: Session;
  let fixtures: Fixtures;
  let studentId: number;
  const studentIds: number[] = [];
  const gradeIds: number[] = [];

  beforeAll(async () => {
    session = await login();
    fixtures = await createFixtures(session);
    studentId = (await createEnrolledStudent(session, fixtures, 'Grade')).studentId;
    studentIds.push(studentId);
  });

  afterAll(async () => {
    await cleanup({ gradeIds, studentIds });
    await fixtures.teardown();
  });

  const createAssessment = async (type: string, maxScore: number, score: number) => {
    const assessment = await asUser(session).post('/api/v1/assessments').send({
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      termId: fixtures.termId,
      teacherId: fixtures.teacherId,
      title: `${type} ${fixtures.suffix}`,
      type,
      maxScore,
      isPublished: true,
    });

    expect(assessment.status).toBe(201);

    // Marks are saved with PUT: the call replaces the result set for the
    // assessment rather than appending to it.
    const results = await asUser(session)
      .put(`/api/v1/assessments/${assessment.body.data.id}/results`)
      .send({ results: [{ studentId, score }] });

    expect(results.status).toBeLessThan(300);

    return assessment.body.data.id as number;
  };

  it('exposes the default grading scheme', async () => {
    const response = await asUser(session).get('/api/v1/grades/schemes');

    expect(response.status).toBe(200);

    const scheme = Array.isArray(response.body.data) ? response.body.data[0] : response.body.data;
    const totalWeight = scheme.components.reduce(
      (sum: number, component: { weightPercent: number }) => sum + Number(component.weightPercent),
      0,
    );

    expect(totalWeight).toBe(100);
  });

  it('calculates a weighted subject grade from the assessment results', async () => {
    await createAssessment('MIDTERM', 100, 90);
    await createAssessment('FINAL', 100, 70);

    const response = await asUser(session).post('/api/v1/grades/calculate').send({
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      termId: fixtures.termId,
    });

    expect(response.status).toBe(200);

    const row = response.body.data.find(
      (entry: { studentId: number }) => entry.studentId === studentId,
    );

    // Midterm 30 and Final 40 are the only weights in play: (90*0.3 + 70*0.4) / 0.7
    expect(row.percentage).toBeCloseTo(78.57, 1);
    expect(row.letterGrade).toEqual(expect.any(String));
    expect(row.componentBreakdown.length).toBeGreaterThan(0);
  });

  it('calculating does not by itself write a grade row', async () => {
    const grades = await asUser(session).get(
      `/api/v1/grades?classId=${fixtures.classId}&subjectId=${fixtures.subjectId}`,
    );

    expect(grades.body.pagination.total).toBe(0);
  });

  it('generates and persists the calculated grades', async () => {
    const response = await asUser(session).post('/api/v1/grades/generate').send({
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      termId: fixtures.termId,
    });

    expect(response.status).toBe(200);

    for (const row of response.body.data) {
      gradeIds.push(row.id);
    }

    const stored = await asUser(session).get(
      `/api/v1/grades?classId=${fixtures.classId}&subjectId=${fixtures.subjectId}`,
    );

    expect(stored.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('records a manual override in the grade history', async () => {
    const saved = await asUser(session).post('/api/v1/grades').send({
      studentId,
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      termId: fixtures.termId,
      score: 95,
      maxScore: 100,
      reason: 'Remarked after appeal',
    });

    expect(saved.status).toBe(200);
    expect(Number(saved.body.data.percentage)).toBe(95);
    gradeIds.push(saved.body.data.id);

    const history = await asUser(session).get(`/api/v1/grades/${saved.body.data.id}/history`);

    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a score above the maximum', async () => {
    const response = await asUser(session).post('/api/v1/grades').send({
      studentId,
      classId: fixtures.classId,
      subjectId: fixtures.subjectId,
      score: 2000,
      maxScore: 100,
    });

    expect(response.status).toBe(422);
  });

  it('lists the grades of one student', async () => {
    const response = await asUser(session).get(
      `/api/v1/grades/student/${studentId}?academicYearId=${fixtures.academicYearId}`,
    );

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});
