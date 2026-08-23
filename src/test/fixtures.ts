/**
 * Fixture builder for the API tests.
 *
 * Every suite creates its own academic year, grade level, subject, room, teacher
 * and class through the public API, so the tests exercise the same validation and
 * authorization a real client meets. The year is deliberately left inactive: the
 * suite must never take over the active year of a database a developer is also
 * using by hand.
 */
import { asUser, cleanup, unique } from './integration';
import type { Session } from './integration';

export interface Fixtures {
  suffix: string;
  academicYearId: number;
  termId: number;
  gradeLevelId: number;
  subjectId: number;
  roomId: number;
  teacherId: number;
  classId: number;
  teardown: () => Promise<void>;
}

const expectCreated = (response: { status: number; body: unknown }, what: string): void => {
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Could not create ${what} (${response.status}): ${JSON.stringify(response.body)}`);
  }
};

export const createFixtures = async (session: Session): Promise<Fixtures> => {
  const api = asUser(session);
  const suffix = unique();

  const yearResponse = await api.post('/api/v1/academic-years').send({
    name: `Test Year ${suffix}`,
    startDate: '2099-09-01',
    endDate: '2100-07-31',
  });
  expectCreated(yearResponse, 'academic year');
  const academicYearId: number = yearResponse.body.data.id;

  const termResponse = await api.post(`/api/v1/academic-years/${academicYearId}/terms`).send({
    name: `Term 1 ${suffix}`,
    termOrder: 1,
    startDate: '2099-09-01',
    endDate: '2100-01-31',
  });
  expectCreated(termResponse, 'term');
  const termId: number = termResponse.body.data.id;

  const gradeLevelResponse = await api.post('/api/v1/grade-levels').send({
    code: `TG${suffix}`,
    nameEn: `Test Grade ${suffix}`,
    levelOrder: 19,
  });
  expectCreated(gradeLevelResponse, 'grade level');
  const gradeLevelId: number = gradeLevelResponse.body.data.id;

  const subjectResponse = await api.post('/api/v1/subjects').send({
    code: `TS${suffix}`,
    nameEn: `Test Subject ${suffix}`,
    gradeLevelIds: [gradeLevelId],
  });
  expectCreated(subjectResponse, 'subject');
  const subjectId: number = subjectResponse.body.data.id;

  const roomResponse = await api.post('/api/v1/rooms').send({
    code: `TR${suffix}`,
    name: `Test Room ${suffix}`,
    capacity: 40,
  });
  expectCreated(roomResponse, 'room');
  const roomId: number = roomResponse.body.data.id;

  const teacherResponse = await api.post('/api/v1/teachers').send({
    firstNameEn: 'Test',
    lastNameEn: `Teacher ${suffix}`,
    subjectIds: [subjectId],
  });
  expectCreated(teacherResponse, 'teacher');
  const teacherId: number = teacherResponse.body.data.id;

  const classResponse = await api.post('/api/v1/classes').send({
    academicYearId,
    gradeLevelId,
    code: `TC${suffix}`,
    name: `Test Class ${suffix}`,
    roomId,
    capacity: 40,
    subjects: [{ subjectId, teacherId }],
  });
  expectCreated(classResponse, 'class');
  const classId: number = classResponse.body.data.id;

  return {
    suffix,
    academicYearId,
    termId,
    gradeLevelId,
    subjectId,
    roomId,
    teacherId,
    classId,
    teardown: async () => {
      await cleanup({
        classIds: [classId],
        roomIds: [roomId],
        subjectIds: [subjectId],
        gradeLevelIds: [gradeLevelId],
        academicYearIds: [academicYearId],
      });
      await removeTeacher(teacherId);
    },
  };
};

/** Teachers are soft deleted through the API, so the fixture removes the row itself. */
const removeTeacher = async (teacherId: number): Promise<void> => {
  const { query } = await import('../database/connection');

  for (const sql of [
    'DELETE FROM teacher_subjects WHERE teacher_id = $1',
    'DELETE FROM teacher_classes WHERE teacher_id = $1',
    'DELETE FROM teachers WHERE id = $1',
  ]) {
    try {
      await query(sql, [teacherId]);
    } catch {
      // Left behind rather than failing a passing suite's teardown.
    }
  }
};

/** Creates a student already enrolled in the fixture class. */
export const createEnrolledStudent = async (
  session: Session,
  fixtures: Fixtures,
  firstName = 'Dara',
): Promise<{ studentId: number; enrollmentId: number }> => {
  const api = asUser(session);
  const response = await api.post('/api/v1/students').send({
    firstNameEn: firstName,
    lastNameEn: `Test ${fixtures.suffix}`,
    gender: 'MALE',
    dateOfBirth: '2016-05-04',
    enrollment: {
      academicYearId: fixtures.academicYearId,
      classId: fixtures.classId,
    },
  });
  expectCreated(response, 'student');

  const studentId: number = response.body.data.id;
  const enrollments = await api.get(`/api/v1/students/${studentId}/enrollments`);

  return { studentId, enrollmentId: enrollments.body.data[0]?.id };
};
