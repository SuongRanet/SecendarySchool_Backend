/**
 * Fixture builder for the API tests.
 *
 * Every suite creates its own academic year, grade level, subject, room, teacher
 * and class through the public API, so the tests exercise the same validation and
 * authorization a real client meets. The year is deliberately left inactive: the
 * suite must never take over the active year of a database a developer is also
 * using by hand.
 */
import { query } from '../database/connection';
import { asUser, cleanup, unique } from './integration';
import type { Session } from './integration';

export interface Fixtures {
  suffix: string;
  /** Calendar year the fixture's academic year starts in; dates derive from it. */
  year: number;
  /**
   * Two dates that sit inside the fixture's academic year and are not in the
   * future, plus the month around them. Attendance may only be recorded for a
   * day that has already happened, so a suite that records attendance asks for
   * `spanToday` and uses these instead of inventing dates.
   */
  dayOne: string;
  dayTwo: string;
  rangeFrom: string;
  rangeTo: string;
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

/**
 * Academic years may not overlap, and a grade level's order is unique, so a
 * fixture cannot reuse a fixed slot: one left behind by an interrupted run, or
 * one belonging to a suite running alongside, would block every later fixture.
 * Each fixture therefore claims its own far-future window and its own order,
 * and retries on the small chance that two draws collide.
 */
const claimYear = (attempt: number): number =>
  2100 + Math.floor(Math.random() * 300) + attempt * 7;

/**
 * Grade level order is capped at 20 by the API and 7-9 belong to the school, so
 * a fixture has eleven slots to choose from.
 *
 * The starting point is random — several suites run in parallel and must not all
 * try 10 first — but the retries then sweep the range in order. Re-rolling the
 * random on every attempt let a fixture try the same taken slot twice and give
 * up while a free one was still going spare.
 */
const LEVEL_ORDER_SLOTS = 11;
const LEVEL_ORDER_BASE = 10;

const claimLevelOrder = (start: number, attempt: number): number =>
  LEVEL_ORDER_BASE + ((start + attempt) % LEVEL_ORDER_SLOTS);

const iso = (date: Date): string => date.toISOString().slice(0, 10);

const shiftDays = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);

  return iso(date);
};

export interface FixtureOptions {
  /**
   * Place the academic year around today rather than far in the future. Needed
   * by any suite that records attendance, which the API refuses to accept for a
   * date that has not happened yet.
   */
  spanToday?: boolean;
}

export const createFixtures = async (
  session: Session,
  options: FixtureOptions = {},
): Promise<Fixtures> => {
  const api = asUser(session);
  const suffix = unique();

  let yearResponse;
  let year = claimYear(0);

  // Years may not overlap, and an interrupted run leaves its year behind, so
  // every fixture clears the empty ones first. Only fixtures ever create a row
  // named "Test Year ...", and one with no class and no enrolment is inert.
  await query(
    `DELETE FROM academic_years
      WHERE name LIKE 'Test Year %'
        AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.academic_year_id = academic_years.id)
        AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.academic_year_id = academic_years.id)`,
  );

  /**
   * Reclaim every abandoned fixture grade level, not only the childless ones.
   *
   * Order is unique and capped at 20, so eleven slots exist in total. A teardown
   * that fails part way — or a suite killed mid-run — leaves a grade level with
   * a class still attached, and the old sweep skipped exactly those. Each one
   * permanently burned a slot, and once all eleven were gone every later fixture
   * failed with GRADE_LEVEL_ORDER_TAKEN.
   *
   * Only fixtures ever create rows named "Test ...", so clearing them and the
   * classes hanging off them is safe. The order below walks child to parent.
   */
  const staleGrades = `SELECT id FROM grade_levels WHERE name_en LIKE 'Test Grade %'`;
  const staleClasses = `SELECT id FROM classes WHERE grade_level_id IN (${staleGrades})`;

  for (const sql of [
    `DELETE FROM attendance WHERE class_id IN (${staleClasses})`,
    `DELETE FROM grades WHERE class_id IN (${staleClasses})`,
    `DELETE FROM report_cards WHERE class_id IN (${staleClasses})`,
    `DELETE FROM assessment_results WHERE assessment_id IN (
       SELECT id FROM assessments WHERE class_id IN (${staleClasses}))`,
    `DELETE FROM assessments WHERE class_id IN (${staleClasses})`,
    `DELETE FROM enrollments WHERE class_id IN (${staleClasses})`,
    `DELETE FROM schedules WHERE class_id IN (${staleClasses})`,
    `DELETE FROM class_subjects WHERE class_id IN (${staleClasses})`,
    `DELETE FROM teacher_classes WHERE class_id IN (${staleClasses})`,
    `DELETE FROM classes WHERE grade_level_id IN (${staleGrades})`,
    `DELETE FROM grade_subjects WHERE grade_level_id IN (${staleGrades})`,
    `DELETE FROM grade_levels WHERE name_en LIKE 'Test Grade %'`,
  ]) {
    try {
      await query(sql);
    } catch {
      // A row held by something outside the fixtures is left alone; the next
      // statement still runs, so one stubborn leftover cannot block the rest.
    }
  }

  if (options.spanToday) {
    const startDate = shiftDays(-180);
    const endDate = shiftDays(180);
    year = Number(startDate.slice(0, 4));

    yearResponse = await api.post('/api/v1/academic-years').send({
      name: `Test Year ${suffix}`,
      startDate,
      endDate,
    });
  } else {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      year = claimYear(attempt);

      yearResponse = await api.post('/api/v1/academic-years').send({
        name: `Test Year ${suffix}`,
        startDate: `${year}-09-01`,
        endDate: `${year + 1}-07-31`,
      });

      if (yearResponse.status === 201 || yearResponse.status === 200) {
        break;
      }
    }
  }

  expectCreated(yearResponse as { status: number; body: unknown }, 'academic year');
  const academicYearId: number = (yearResponse as { body: { data: { id: number } } }).body.data.id;

  const termResponse = await api.post(`/api/v1/academic-years/${academicYearId}/terms`).send({
    name: `Term 1 ${suffix}`,
    termOrder: 1,
    startDate: options.spanToday ? shiftDays(-180) : `${year}-09-01`,
    endDate: options.spanToday ? shiftDays(30) : `${year + 1}-01-31`,
  });
  expectCreated(termResponse, 'term');
  const termId: number = termResponse.body.data.id;

  let gradeLevelResponse;
  const levelOrderStart = Math.floor(Math.random() * LEVEL_ORDER_SLOTS);

  for (let attempt = 0; attempt < LEVEL_ORDER_SLOTS; attempt += 1) {
    gradeLevelResponse = await api.post('/api/v1/grade-levels').send({
      code: `TG${suffix}`,
      nameEn: `Test Grade ${suffix}`,
      levelOrder: claimLevelOrder(levelOrderStart, attempt),
    });

    if (gradeLevelResponse.status === 201 || gradeLevelResponse.status === 200) {
      break;
    }
  }

  expectCreated(gradeLevelResponse as { status: number; body: unknown }, 'grade level');
  const gradeLevelId: number = (gradeLevelResponse as { body: { data: { id: number } } }).body.data
    .id;

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
    year,
    dayOne: options.spanToday ? shiftDays(-2) : `${year}-09-07`,
    dayTwo: options.spanToday ? shiftDays(-1) : `${year}-09-08`,
    rangeFrom: options.spanToday ? shiftDays(-30) : `${year}-09-01`,
    rangeTo: options.spanToday ? shiftDays(0) : `${year}-09-30`,
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
