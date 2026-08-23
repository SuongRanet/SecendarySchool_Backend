import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import { buildSearchPattern } from '../../utils/pagination';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  CreateSessionInput,
  NationalExamRegistrationRow,
  NationalExamResultRow,
  NationalExamSessionRow,
  NationalExamSubjectScoreRow,
  RegistrationFilters,
  UpdateSessionInput,
} from './national-exam.types';

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const SESSION_SELECT = `
  SELECT s.*,
         y.name AS academic_year_name,
         (SELECT COUNT(*)::int FROM national_exam_registrations r
           WHERE r.session_id = s.id) AS registered_count,
         (SELECT COUNT(*)::int FROM national_exam_registrations r
            JOIN national_exam_results res ON res.registration_id = r.id
                                          AND res.superseded_at IS NULL
           WHERE r.session_id = s.id) AS result_count,
         (SELECT COUNT(*)::int FROM national_exam_registrations r
            JOIN national_exam_results res ON res.registration_id = r.id
                                          AND res.superseded_at IS NULL
           WHERE r.session_id = s.id AND res.is_pass) AS pass_count
    FROM national_exam_sessions s
    JOIN academic_years y ON y.id = s.academic_year_id
`;

export const findSessions = async (
  academicYearId?: number,
  executor: Queryable = pool,
): Promise<NationalExamSessionRow[]> => {
  const params = new ParamBuilder();
  const where = academicYearId ? `WHERE s.academic_year_id = ${params.add(academicYearId)}` : '';

  const result = await executor.query<NationalExamSessionRow>(
    `${SESSION_SELECT} ${where} ORDER BY s.starts_on DESC`,
    params.params,
  );

  return result.rows;
};

export const findSessionById = async (
  id: number,
  executor: Queryable = pool,
): Promise<NationalExamSessionRow | null> => {
  const result = await executor.query<NationalExamSessionRow>(`${SESSION_SELECT} WHERE s.id = $1`, [
    id,
  ]);

  return result.rows[0] ?? null;
};

export const insertSession = async (
  input: CreateSessionInput,
  executor: Queryable = pool,
): Promise<NationalExamSessionRow> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO national_exam_sessions
       (academic_year_id, name, centre_name, centre_code, starts_on, ends_on,
        registration_deadline, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.academicYearId,
      input.name,
      input.centreName ?? null,
      input.centreCode ?? null,
      input.startsOn,
      input.endsOn,
      input.registrationDeadline ?? null,
      input.notes ?? null,
    ],
  );

  return (await findSessionById(result.rows[0].id, executor)) as NationalExamSessionRow;
};

export const updateSession = async (
  id: number,
  patch: UpdateSessionInput,
  executor: Queryable = pool,
): Promise<NationalExamSessionRow | null> => {
  const { assignments, params } = buildUpdateSet<UpdateSessionInput>(patch, {
    name: { column: 'name' },
    centreName: { column: 'centre_name' },
    centreCode: { column: 'centre_code' },
    startsOn: { column: 'starts_on', cast: 'date' },
    endsOn: { column: 'ends_on', cast: 'date' },
    registrationDeadline: { column: 'registration_deadline', cast: 'date' },
    isOpen: { column: 'is_open' },
    notes: { column: 'notes' },
  });

  if (assignments.length === 0) {
    return findSessionById(id, executor);
  }

  await executor.query(
    `UPDATE national_exam_sessions SET ${assignments.join(', ')} WHERE id = $${params.length + 1}`,
    [...params, id],
  );

  return findSessionById(id, executor);
};

export const deleteSession = async (id: number, executor: Queryable = pool): Promise<void> => {
  await executor.query('DELETE FROM national_exam_sessions WHERE id = $1', [id]);
};

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

const REGISTRATION_SELECT = `
  SELECT r.*,
         st.student_code,
         (st.first_name_en || ' ' || st.last_name_en) AS student_name,
         NULLIF(TRIM(COALESCE(st.first_name_kh, '') || ' ' || COALESCE(st.last_name_kh, '')), '')
           AS student_name_kh,
         st.gender::text AS gender,
         st.date_of_birth,
         e.class_id,
         c.name AS class_name,
         gl.code AS grade_level_code,
         s.name AS session_name,
         s.centre_name,
         s.starts_on,
         s.ends_on,
         s.academic_year_id,
         y.name AS academic_year_name,
         res.result_grade,
         res.total_score,
         res.is_pass,
         res.published_on
    FROM national_exam_registrations r
    JOIN students st ON st.id = r.student_id
    JOIN enrollments e ON e.id = r.enrollment_id
    JOIN classes c ON c.id = e.class_id
    JOIN grade_levels gl ON gl.id = c.grade_level_id
    JOIN national_exam_sessions s ON s.id = r.session_id
    JOIN academic_years y ON y.id = s.academic_year_id
    LEFT JOIN national_exam_results res ON res.registration_id = r.id
                                       AND res.superseded_at IS NULL
`;

export const findRegistrations = async (
  filters: RegistrationFilters,
  executor: Queryable = pool,
): Promise<NationalExamRegistrationRow[]> => {
  const params = new ParamBuilder();
  const conditions: string[] = [];

  if (filters.sessionId) {
    conditions.push(`r.session_id = ${params.add(filters.sessionId)}`);
  }

  if (filters.studentId) {
    conditions.push(`r.student_id = ${params.add(filters.studentId)}`);
  }

  if (filters.classId) {
    conditions.push(`e.class_id = ${params.add(filters.classId)}`);
  }

  if (filters.status) {
    conditions.push(`r.status = ${params.add(filters.status)}::national_exam_reg_status`);
  }

  if (filters.search) {
    const pattern = params.add(buildSearchPattern(filters.search));
    conditions.push(
      `(st.first_name_en ILIKE ${pattern} OR st.last_name_en ILIKE ${pattern}
        OR st.student_code ILIKE ${pattern} OR r.seat_number ILIKE ${pattern})`,
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await executor.query<NationalExamRegistrationRow>(
    `${REGISTRATION_SELECT} ${where} ORDER BY c.name, r.seat_number NULLS LAST, student_name`,
    params.params,
  );

  return result.rows;
};

export const findRegistrationById = async (
  id: number,
  executor: Queryable = pool,
): Promise<NationalExamRegistrationRow | null> => {
  const result = await executor.query<NationalExamRegistrationRow>(
    `${REGISTRATION_SELECT} WHERE r.id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
};

/** The candidate's active enrolment, used to prove they sit in a Grade 9 class. */
export const findExitGradeEnrollment = async (
  studentId: number,
  academicYearId: number,
  executor: Queryable = pool,
): Promise<{ id: number; class_id: number; class_name: string; is_exit_grade: boolean } | null> => {
  const result = await executor.query<{
    id: number;
    class_id: number;
    class_name: string;
    is_exit_grade: boolean;
  }>(
    `SELECT e.id, e.class_id, c.name AS class_name, gl.is_exit_grade
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       JOIN grade_levels gl ON gl.id = c.grade_level_id
      WHERE e.student_id = $1 AND e.academic_year_id = $2 AND e.status = 'ACTIVE'
      ORDER BY e.enrolled_date DESC, e.id DESC
      LIMIT 1`,
    [studentId, academicYearId],
  );

  return result.rows[0] ?? null;
};

export const findLatestAttempt = async (
  sessionId: number,
  studentId: number,
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ attempt: number }>(
    `SELECT COALESCE(MAX(attempt), 0)::int AS attempt
       FROM national_exam_registrations
      WHERE session_id = $1 AND student_id = $2`,
    [sessionId, studentId],
  );

  return result.rows[0]?.attempt ?? 0;
};

export const insertRegistration = async (
  input: {
    sessionId: number;
    studentId: number;
    enrollmentId: number;
    seatNumber: string | null;
    attempt: number;
    remarks: string | null;
    registeredBy: number | null;
  },
  executor: Queryable = pool,
): Promise<NationalExamRegistrationRow> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO national_exam_registrations
       (session_id, student_id, enrollment_id, seat_number, attempt, remarks, registered_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.sessionId,
      input.studentId,
      input.enrollmentId,
      input.seatNumber,
      input.attempt,
      input.remarks,
      input.registeredBy,
    ],
  );

  return (await findRegistrationById(
    result.rows[0].id,
    executor,
  )) as NationalExamRegistrationRow;
};

export const updateRegistration = async (
  id: number,
  patch: { seatNumber?: string | null; status?: string; remarks?: string | null },
  executor: Queryable = pool,
): Promise<NationalExamRegistrationRow | null> => {
  const { assignments, params } = buildUpdateSet<typeof patch>(patch, {
    seatNumber: { column: 'seat_number' },
    status: { column: 'status', cast: 'national_exam_reg_status' },
    remarks: { column: 'remarks' },
  });

  if (assignments.length === 0) {
    return findRegistrationById(id, executor);
  }

  await executor.query(
    `UPDATE national_exam_registrations SET ${assignments.join(', ')} WHERE id = $${params.length + 1}`,
    [...params, id],
  );

  return findRegistrationById(id, executor);
};

export const deleteRegistration = async (id: number, executor: Queryable = pool): Promise<void> => {
  await executor.query('DELETE FROM national_exam_registrations WHERE id = $1', [id]);
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export const findLiveResult = async (
  registrationId: number,
  executor: Queryable = pool,
): Promise<NationalExamResultRow | null> => {
  const result = await executor.query<NationalExamResultRow>(
    `SELECT * FROM national_exam_results
      WHERE registration_id = $1 AND superseded_at IS NULL`,
    [registrationId],
  );

  return result.rows[0] ?? null;
};

export const findResultHistory = async (
  registrationId: number,
  executor: Queryable = pool,
): Promise<NationalExamResultRow[]> => {
  const result = await executor.query<NationalExamResultRow>(
    `SELECT * FROM national_exam_results
      WHERE registration_id = $1
      ORDER BY created_at DESC`,
    [registrationId],
  );

  return result.rows;
};

export const supersedeResult = async (
  resultId: number,
  userId: number | null,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query(
    `UPDATE national_exam_results
        SET superseded_at = NOW(), superseded_by = $2
      WHERE id = $1`,
    [resultId, userId],
  );
};

export const insertResult = async (
  input: {
    registrationId: number;
    resultGrade: string;
    totalScore: number | null;
    isPass: boolean;
    publishedOn: string;
    publishedBy: number | null;
    amendmentReason: string | null;
  },
  executor: Queryable = pool,
): Promise<NationalExamResultRow> => {
  const result = await executor.query<NationalExamResultRow>(
    `INSERT INTO national_exam_results
       (registration_id, result_grade, total_score, is_pass, published_on, published_by,
        amendment_reason)
     VALUES ($1, $2::national_exam_grade, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.registrationId,
      input.resultGrade,
      input.totalScore,
      input.isPass,
      input.publishedOn,
      input.publishedBy,
      input.amendmentReason,
    ],
  );

  return result.rows[0];
};

export const insertSubjectScores = async (
  resultId: number,
  scores: { subjectId: number; score: number; maxScore?: number }[],
  executor: Queryable = pool,
): Promise<void> => {
  for (const score of scores) {
    await executor.query(
      `INSERT INTO national_exam_subject_scores (result_id, subject_id, score, max_score)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (result_id, subject_id) DO UPDATE
         SET score = EXCLUDED.score, max_score = EXCLUDED.max_score`,
      [resultId, score.subjectId, score.score, score.maxScore ?? 100],
    );
  }
};

export const findSubjectScores = async (
  resultId: number,
  executor: Queryable = pool,
): Promise<NationalExamSubjectScoreRow[]> => {
  const result = await executor.query<NationalExamSubjectScoreRow>(
    `SELECT sc.*, s.code AS subject_code, s.name_en AS subject_name, s.name_kh AS subject_name_kh
       FROM national_exam_subject_scores sc
       JOIN subjects s ON s.id = sc.subject_id
      WHERE sc.result_id = $1
      ORDER BY s.subject_group, s.code`,
    [resultId],
  );

  return result.rows;
};

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export const findSessionStatistics = async (
  sessionId: number,
  executor: Queryable = pool,
): Promise<{
  totals: {
    registered: number;
    sat: number;
    absent: number;
    published: number;
    passed: number;
  };
  byClass: {
    class_id: number;
    class_name: string;
    registered: number;
    published: number;
    passed: number;
  }[];
  byGrade: { result_grade: string; count: number }[];
}> => {
  const totals = await executor.query<{
    registered: number;
    sat: number;
    absent: number;
    published: number;
    passed: number;
  }>(
    `SELECT COUNT(*)::int AS registered,
            COUNT(*) FILTER (WHERE r.status IN ('SAT', 'RESULT_PUBLISHED'))::int AS sat,
            COUNT(*) FILTER (WHERE r.status = 'ABSENT')::int AS absent,
            COUNT(res.id)::int AS published,
            COUNT(res.id) FILTER (WHERE res.is_pass)::int AS passed
       FROM national_exam_registrations r
       LEFT JOIN national_exam_results res ON res.registration_id = r.id
                                          AND res.superseded_at IS NULL
      WHERE r.session_id = $1`,
    [sessionId],
  );

  const byClass = await executor.query<{
    class_id: number;
    class_name: string;
    registered: number;
    published: number;
    passed: number;
  }>(
    `SELECT c.id AS class_id,
            c.name AS class_name,
            COUNT(*)::int AS registered,
            COUNT(res.id)::int AS published,
            COUNT(res.id) FILTER (WHERE res.is_pass)::int AS passed
       FROM national_exam_registrations r
       JOIN enrollments e ON e.id = r.enrollment_id
       JOIN classes c ON c.id = e.class_id
       LEFT JOIN national_exam_results res ON res.registration_id = r.id
                                          AND res.superseded_at IS NULL
      WHERE r.session_id = $1
      GROUP BY c.id, c.name
      ORDER BY c.name`,
    [sessionId],
  );

  const byGrade = await executor.query<{ result_grade: string; count: number }>(
    `SELECT res.result_grade::text AS result_grade, COUNT(*)::int AS count
       FROM national_exam_registrations r
       JOIN national_exam_results res ON res.registration_id = r.id
                                     AND res.superseded_at IS NULL
      WHERE r.session_id = $1
      GROUP BY res.result_grade
      ORDER BY res.result_grade`,
    [sessionId],
  );

  return {
    totals: totals.rows[0] ?? { registered: 0, sat: 0, absent: 0, published: 0, passed: 0 },
    byClass: byClass.rows,
    byGrade: byGrade.rows,
  };
};
