/**
 * Integration test harness.
 *
 * The API tests exercise real HTTP requests against a real PostgreSQL database,
 * so they need a migrated and seeded schema. A developer without a database
 * should still be able to run `npm test` and see the unit tests pass, so the
 * suites call `describeApi` instead of `describe`: when no database answers, or
 * when the schema has not been migrated, the whole suite is skipped with a
 * printed explanation rather than failing.
 *
 * Prepare the test database once with:
 *
 *   createdb primary_school_test
 *   DATABASE_URL=postgresql://.../primary_school_test npm run migrate
 *   DATABASE_URL=postgresql://.../primary_school_test npm run seed
 */
import type { Application } from 'express';
import request from 'supertest';
import { afterAll, describe } from 'vitest';
import { createApp } from '../app';
import { env } from '../config';
import { pool, query } from '../database/connection';

let cachedApp: Application | null = null;

/** The Express application, built once and shared by every integration suite. */
export const getApp = (): Application => {
  if (!cachedApp) {
    cachedApp = createApp();
  }

  return cachedApp;
};

/**
 * True when a database is reachable and carries the seeded schema. Anything else
 * — no server, wrong credentials, un-migrated database — reports false so the
 * suite skips instead of reporting a false failure.
 */
export const isApiTestable = async (): Promise<boolean> => {
  try {
    const result = await query<{ ready: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'enrollments'
       )
       AND EXISTS (SELECT 1 FROM roles WHERE code = 'SUPER_ADMIN') AS ready`,
    );

    return result.rows[0]?.ready === true;
  } catch {
    return false;
  }
};

const apiTestable = await isApiTestable();

if (!apiTestable) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n[integration] Skipping API tests: no migrated and seeded database at DATABASE_URL.\n' +
      '[integration] See src/test/integration.ts for the one-time setup.\n',
  );
}

/** `describe` that skips the whole suite when there is no database to talk to. */
export const describeApi = apiTestable ? describe : describe.skip;

/** Releases the connection pool so the vitest process can exit. */
let poolClosed = false;

/**
 * Releases the connection pool.
 *
 * A pg pool cannot be reopened, so this must run once and only after every
 * suite in the file is done. It used to be called from each suite's `afterAll`,
 * which meant the first block to finish pulled the connection out from under
 * the blocks that followed and they all failed with "Cannot use a pool after
 * calling end on the pool". The file-level `afterAll` below is now the single
 * caller; the guard keeps any remaining explicit call harmless.
 */
export const closeDatabase = async (): Promise<void> => {
  if (poolClosed) {
    return;
  }

  poolClosed = true;
  await pool.end().catch(() => undefined);
};

// Registered at import time, so it runs after every suite in the importing file.
afterAll(closeDatabase);

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: number;
}

/** Signs in and returns the tokens, failing loudly if the credentials are wrong. */
export const login = async (
  identifier = env.SEED_SUPER_ADMIN_USERNAME,
  password = env.SEED_SUPER_ADMIN_PASSWORD,
): Promise<Session> => {
  const response = await request(getApp())
    .post('/api/v1/auth/login')
    .send({ identifier, password });

  if (response.status !== 200) {
    throw new Error(
      `Login failed for "${identifier}" (${response.status}): ${JSON.stringify(response.body)}`,
    );
  }

  // The login envelope nests the pair under `tokens`; reading them from the top
  // level silently yielded undefined and every authenticated request came back
  // 401, which went unnoticed because the suites skip without a database.
  return {
    accessToken: response.body.data.tokens.accessToken,
    refreshToken: response.body.data.tokens.refreshToken,
    userId: response.body.data.user.id,
  };
};

/** A request agent that carries the session's bearer token. */
export const asUser = (session: Session) => {
  const agent = request(getApp());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${session.accessToken}`);

  return {
    get: (url: string) => auth(agent.get(url)),
    post: (url: string) => auth(agent.post(url)),
    put: (url: string) => auth(agent.put(url)),
    patch: (url: string) => auth(agent.patch(url)),
    delete: (url: string) => auth(agent.delete(url)),
  };
};

/**
 * A short suffix that makes every fixture unique, so a re-run does not collide
 * with rows left behind by an interrupted previous run.
 */
export const unique = (): string => Math.random().toString(36).slice(2, 8).toUpperCase();

/**
 * Removes the rows a suite created. Deletion runs child-first so foreign keys
 * stay satisfied, and each statement is independent so one failure does not
 * strand the rest.
 */
export const cleanup = async (ids: {
  attendanceIds?: number[];
  gradeIds?: number[];
  scheduleIds?: number[];
  enrollmentIds?: number[];
  studentIds?: number[];
  parentIds?: number[];
  classIds?: number[];
  subjectIds?: number[];
  roomIds?: number[];
  gradeLevelIds?: number[];
  academicYearIds?: number[];
}): Promise<void> => {
  const steps: [string, number[] | undefined][] = [
    ['DELETE FROM attendance WHERE id = ANY($1::int[])', ids.attendanceIds],
    ['DELETE FROM grade_history WHERE grade_id = ANY($1::int[])', ids.gradeIds],
    ['DELETE FROM grades WHERE id = ANY($1::int[])', ids.gradeIds],
    ['DELETE FROM schedules WHERE id = ANY($1::int[])', ids.scheduleIds],
    ['DELETE FROM attendance WHERE student_id = ANY($1::int[])', ids.studentIds],
    ['DELETE FROM grades WHERE student_id = ANY($1::int[])', ids.studentIds],
    ['DELETE FROM student_parents WHERE student_id = ANY($1::int[])', ids.studentIds],
    ['DELETE FROM student_parents WHERE parent_id = ANY($1::int[])', ids.parentIds],
    ['DELETE FROM enrollments WHERE id = ANY($1::int[])', ids.enrollmentIds],
    ['DELETE FROM enrollments WHERE student_id = ANY($1::int[])', ids.studentIds],
    ['DELETE FROM students WHERE id = ANY($1::int[])', ids.studentIds],
    ['DELETE FROM parents WHERE id = ANY($1::int[])', ids.parentIds],
    ['DELETE FROM schedules WHERE class_id = ANY($1::int[])', ids.classIds],
    ['DELETE FROM class_subjects WHERE class_id = ANY($1::int[])', ids.classIds],
    ['DELETE FROM teacher_classes WHERE class_id = ANY($1::int[])', ids.classIds],
    ['DELETE FROM classes WHERE id = ANY($1::int[])', ids.classIds],
    ['DELETE FROM grade_subjects WHERE subject_id = ANY($1::int[])', ids.subjectIds],
    ['DELETE FROM subjects WHERE id = ANY($1::int[])', ids.subjectIds],
    ['DELETE FROM rooms WHERE id = ANY($1::int[])', ids.roomIds],
    ['DELETE FROM grade_subjects WHERE grade_level_id = ANY($1::int[])', ids.gradeLevelIds],
    ['DELETE FROM grade_levels WHERE id = ANY($1::int[])', ids.gradeLevelIds],
    /*
     * Everything else still hanging off the fixture's year.
     *
     * A suite often creates more than the fixture handed it — a second class, an
     * assignment, a register — and those rows keep the year alive. The year
     * delete then fails, silently by design, and the abandoned year blocks the
     * next suite that wants the same window, because academic years may not
     * overlap. Three separate runs were derailed by a stale year before this was
     * traced. These steps are scoped to the fixture's own year, so they can
     * only ever remove what the test itself created.
     */
    [
      `DELETE FROM submissions WHERE assignment_id IN
         (SELECT id FROM assignments WHERE academic_year_id = ANY($1::int[]))`,
      ids.academicYearIds,
    ],
    ['DELETE FROM assignments WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    [
      `DELETE FROM exam_results WHERE exam_id IN
         (SELECT id FROM exams WHERE academic_year_id = ANY($1::int[]))`,
      ids.academicYearIds,
    ],
    ['DELETE FROM exams WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    [
      `DELETE FROM report_card_subjects WHERE report_card_id IN
         (SELECT id FROM report_cards WHERE academic_year_id = ANY($1::int[]))`,
      ids.academicYearIds,
    ],
    ['DELETE FROM report_cards WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    [
      `DELETE FROM grade_history WHERE grade_id IN
         (SELECT id FROM grades WHERE academic_year_id = ANY($1::int[]))`,
      ids.academicYearIds,
    ],
    ['DELETE FROM grades WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    [
      `DELETE FROM assessment_results WHERE assessment_id IN
         (SELECT id FROM assessments WHERE academic_year_id = ANY($1::int[]))`,
      ids.academicYearIds,
    ],
    ['DELETE FROM assessments WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    ['DELETE FROM student_behaviors WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    ['DELETE FROM student_comments WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    ['DELETE FROM announcements WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    ['DELETE FROM attendance WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    ['DELETE FROM enrollments WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    ['DELETE FROM schedules WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    [
      `DELETE FROM class_subjects WHERE class_id IN
         (SELECT id FROM classes WHERE academic_year_id = ANY($1::int[]))`,
      ids.academicYearIds,
    ],
    [
      `DELETE FROM teacher_classes WHERE class_id IN
         (SELECT id FROM classes WHERE academic_year_id = ANY($1::int[]))`,
      ids.academicYearIds,
    ],
    ['DELETE FROM classes WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    ['DELETE FROM academic_terms WHERE academic_year_id = ANY($1::int[])', ids.academicYearIds],
    ['DELETE FROM academic_years WHERE id = ANY($1::int[])', ids.academicYearIds],
  ];

  for (const [sql, values] of steps) {
    if (!values || values.length === 0) continue;

    try {
      await query(sql, [values]);
    } catch {
      // A dependent row elsewhere may legitimately hold this fixture; leaving it
      // behind is preferable to failing the teardown of a passing suite.
    }
  }
};
