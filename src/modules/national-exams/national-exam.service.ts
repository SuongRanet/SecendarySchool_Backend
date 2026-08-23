import { withTransaction } from '../../database/connection';
import type { AuditContext } from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as academicYearRepository from '../academic-years/academic-year.repository';
import * as studentRepository from '../students/student.repository';
import * as repository from './national-exam.repository';
import type {
  AmendResultInput,
  CreateSessionInput,
  NationalExamGrade,
  NationalExamRegistrationDto,
  NationalExamRegistrationRow,
  NationalExamResultDto,
  NationalExamSessionDto,
  NationalExamSessionRow,
  PublishResultInput,
  RegisterCandidateInput,
  RegistrationFilters,
  SessionStatisticsDto,
  UpdateSessionInput,
} from './national-exam.types';

/**
 * A pass rate as a percentage, or null when nothing has been published yet.
 * Kept pure so the rounding rule is testable without a database.
 */
export const calculatePassRate = (passed: number, published: number): number | null =>
  published > 0 ? Number(((passed / published) * 100).toFixed(2)) : null;

/**
 * The Cambodian national examination grades in descending order. Anything from
 * A to E is a pass; only F fails. Callers may override the outcome explicitly,
 * but this is the default so a typo cannot silently record a failed pass.
 */
export const isPassingGrade = (grade: NationalExamGrade): boolean => grade !== 'F';

const toSessionDto = (row: NationalExamSessionRow): NationalExamSessionDto => ({
  id: row.id,
  academicYearId: row.academic_year_id,
  academicYearName: row.academic_year_name ?? null,
  name: row.name,
  centreName: row.centre_name,
  centreCode: row.centre_code,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  registrationDeadline: row.registration_deadline,
  isOpen: row.is_open,
  notes: row.notes,
  registeredCount: row.registered_count ?? 0,
  resultCount: row.result_count ?? 0,
  passCount: row.pass_count ?? 0,
  passRate: calculatePassRate(row.pass_count ?? 0, row.result_count ?? 0),
});

const toRegistrationDto = (row: NationalExamRegistrationRow): NationalExamRegistrationDto => ({
  id: row.id,
  sessionId: row.session_id,
  sessionName: row.session_name ?? null,
  centreName: row.centre_name ?? null,
  startsOn: row.starts_on ?? null,
  endsOn: row.ends_on ?? null,
  academicYearId: row.academic_year_id ?? null,
  academicYearName: row.academic_year_name ?? null,
  studentId: row.student_id,
  studentCode: row.student_code ?? null,
  studentName: row.student_name ?? null,
  studentNameKh: row.student_name_kh ?? null,
  gender: row.gender ?? null,
  dateOfBirth: row.date_of_birth ?? null,
  enrollmentId: row.enrollment_id,
  classId: row.class_id ?? null,
  className: row.class_name ?? null,
  seatNumber: row.seat_number,
  attempt: row.attempt,
  status: row.status,
  remarks: row.remarks,
  result:
    row.result_grade != null
      ? {
          resultGrade: row.result_grade,
          totalScore: row.total_score ?? null,
          isPass: row.is_pass ?? false,
          publishedOn: row.published_on as string,
        }
      : null,
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const listSessions = async (academicYearId?: number): Promise<NationalExamSessionDto[]> => {
  const rows = await repository.findSessions(academicYearId);

  return rows.map(toSessionDto);
};

export const getSessionById = async (id: number): Promise<NationalExamSessionDto> => {
  const row = await repository.findSessionById(id);

  if (!row) {
    throw AppError.notFound('National examination session not found', 'NATIONAL_EXAM_SESSION_NOT_FOUND');
  }

  return toSessionDto(row);
};

export const createSession = async (
  input: CreateSessionInput,
  context: AuditContext,
): Promise<NationalExamSessionDto> => {
  const year = await academicYearRepository.findAcademicYearById(input.academicYearId);

  if (!year) {
    throw AppError.notFound('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND');
  }

  if (input.endsOn < input.startsOn) {
    throw AppError.badRequest(
      'The sitting cannot end before it starts',
      'NATIONAL_EXAM_DATE_ORDER',
    );
  }

  const created = await withTransaction(async (client) => {
    const row = await repository.insertSession(input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'national_exam_session',
        entityId: row.id,
        description: `Created national examination session ${row.name}`,
        newValue: { name: row.name, startsOn: row.starts_on, endsOn: row.ends_on },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  return toSessionDto(created);
};

export const updateSession = async (
  id: number,
  input: UpdateSessionInput,
  context: AuditContext,
): Promise<NationalExamSessionDto> => {
  const existing = await repository.findSessionById(id);

  if (!existing) {
    throw AppError.notFound('National examination session not found', 'NATIONAL_EXAM_SESSION_NOT_FOUND');
  }

  const startsOn = input.startsOn ?? existing.starts_on;
  const endsOn = input.endsOn ?? existing.ends_on;

  if (endsOn < startsOn) {
    throw AppError.badRequest(
      'The sitting cannot end before it starts',
      'NATIONAL_EXAM_DATE_ORDER',
    );
  }

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateSession(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'national_exam_session',
        entityId: id,
        description: `Updated national examination session ${existing.name}`,
        oldValue: { name: existing.name, isOpen: existing.is_open },
        newValue: input as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row as NationalExamSessionRow;
  });

  return toSessionDto(updated);
};

export const deleteSession = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findSessionById(id);

  if (!existing) {
    throw AppError.notFound('National examination session not found', 'NATIONAL_EXAM_SESSION_NOT_FOUND');
  }

  // Deleting a session would cascade its registrations away. A session that has
  // candidates is closed instead, so the record survives.
  if ((existing.registered_count ?? 0) > 0) {
    throw AppError.conflict(
      'This session already has registered candidates and cannot be deleted. Close it instead.',
      'NATIONAL_EXAM_SESSION_HAS_CANDIDATES',
    );
  }

  await withTransaction(async (client) => {
    await repository.deleteSession(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'DELETE',
        entityType: 'national_exam_session',
        entityId: id,
        description: `Deleted national examination session ${existing.name}`,
        oldValue: { name: existing.name },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export const listRegistrations = async (
  filters: RegistrationFilters,
): Promise<NationalExamRegistrationDto[]> => {
  const rows = await repository.findRegistrations(filters);

  return rows.map(toRegistrationDto);
};

export const getRegistrationById = async (id: number): Promise<NationalExamRegistrationDto> => {
  const row = await repository.findRegistrationById(id);

  if (!row) {
    throw AppError.notFound('Registration not found', 'NATIONAL_EXAM_REGISTRATION_NOT_FOUND');
  }

  return toRegistrationDto(row);
};

/**
 * Registers one candidate.
 *
 * Only a student with an active enrolment in an exit-grade class (Grade 9) may
 * be registered — the eligibility check reads `grade_levels.is_exit_grade`
 * rather than matching a grade code, so renaming the grade cannot break it.
 */
export const registerCandidate = async (
  sessionId: number,
  input: RegisterCandidateInput,
  context: AuditContext,
): Promise<NationalExamRegistrationDto> => {
  const session = await repository.findSessionById(sessionId);

  if (!session) {
    throw AppError.notFound('National examination session not found', 'NATIONAL_EXAM_SESSION_NOT_FOUND');
  }

  if (!session.is_open) {
    throw AppError.conflict(
      'Registration for this session is closed',
      'NATIONAL_EXAM_SESSION_CLOSED',
    );
  }

  const student = await studentRepository.findStudentById(input.studentId);

  if (!student) {
    throw AppError.notFound('Student not found', 'STUDENT_NOT_FOUND');
  }

  const enrollment = await repository.findExitGradeEnrollment(
    input.studentId,
    session.academic_year_id,
  );

  if (!enrollment) {
    throw AppError.badRequest(
      'This student has no active enrolment in the academic year of this session',
      'NATIONAL_EXAM_NOT_ENROLLED',
    );
  }

  if (!enrollment.is_exit_grade) {
    throw AppError.badRequest(
      `Only Grade 9 students may sit the national examination; this student is enrolled in ${enrollment.class_name}`,
      'NATIONAL_EXAM_NOT_EXIT_GRADE',
    );
  }

  const previousAttempts = await repository.findLatestAttempt(sessionId, input.studentId);

  if (previousAttempts > 0) {
    throw AppError.conflict(
      'This student is already registered for this session',
      'NATIONAL_EXAM_ALREADY_REGISTERED',
    );
  }

  const created = await withTransaction(async (client) => {
    const row = await repository.insertRegistration(
      {
        sessionId,
        studentId: input.studentId,
        enrollmentId: enrollment.id,
        seatNumber: input.seatNumber ?? null,
        attempt: 1,
        remarks: input.remarks ?? null,
        registeredBy: context.userId,
      },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'national_exam_registration',
        entityId: row.id,
        description: `Registered ${student.first_name_en} ${student.last_name_en} for ${session.name}`,
        newValue: { sessionId, studentId: input.studentId, seatNumber: input.seatNumber ?? null },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  return toRegistrationDto(created);
};

/** Registers a resit as a new attempt, leaving the earlier attempt untouched. */
export const registerResit = async (
  sessionId: number,
  input: RegisterCandidateInput,
  context: AuditContext,
): Promise<NationalExamRegistrationDto> => {
  const session = await repository.findSessionById(sessionId);

  if (!session) {
    throw AppError.notFound('National examination session not found', 'NATIONAL_EXAM_SESSION_NOT_FOUND');
  }

  const enrollment = await repository.findExitGradeEnrollment(
    input.studentId,
    session.academic_year_id,
  );

  if (!enrollment || !enrollment.is_exit_grade) {
    throw AppError.badRequest(
      'Only a student actively enrolled in Grade 9 may sit the national examination',
      'NATIONAL_EXAM_NOT_EXIT_GRADE',
    );
  }

  const previousAttempts = await repository.findLatestAttempt(sessionId, input.studentId);

  if (previousAttempts === 0) {
    throw AppError.badRequest(
      'There is no earlier attempt to resit; register the student normally instead',
      'NATIONAL_EXAM_NO_PREVIOUS_ATTEMPT',
    );
  }

  const created = await withTransaction(async (client) => {
    const row = await repository.insertRegistration(
      {
        sessionId,
        studentId: input.studentId,
        enrollmentId: enrollment.id,
        seatNumber: input.seatNumber ?? null,
        attempt: previousAttempts + 1,
        remarks: input.remarks ?? null,
        registeredBy: context.userId,
      },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'national_exam_registration',
        entityId: row.id,
        description: `Registered resit attempt ${previousAttempts + 1} for ${session.name}`,
        newValue: { sessionId, studentId: input.studentId, attempt: previousAttempts + 1 },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  return toRegistrationDto(created);
};

export const updateRegistration = async (
  id: number,
  input: { seatNumber?: string | null; status?: NationalExamRegistrationDto['status']; remarks?: string | null },
  context: AuditContext,
): Promise<NationalExamRegistrationDto> => {
  const existing = await repository.findRegistrationById(id);

  if (!existing) {
    throw AppError.notFound('Registration not found', 'NATIONAL_EXAM_REGISTRATION_NOT_FOUND');
  }

  if (existing.status === 'RESULT_PUBLISHED' && input.status && input.status !== 'RESULT_PUBLISHED') {
    throw AppError.conflict(
      'The result of this candidate is already published; its status can no longer be changed',
      'NATIONAL_EXAM_RESULT_PUBLISHED',
    );
  }

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateRegistration(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'national_exam_registration',
        entityId: id,
        description: `Updated registration for ${existing.student_name}`,
        oldValue: { seatNumber: existing.seat_number, status: existing.status },
        newValue: input as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row as NationalExamRegistrationRow;
  });

  return toRegistrationDto(updated);
};

export const cancelRegistration = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findRegistrationById(id);

  if (!existing) {
    throw AppError.notFound('Registration not found', 'NATIONAL_EXAM_REGISTRATION_NOT_FOUND');
  }

  if (existing.status === 'RESULT_PUBLISHED') {
    throw AppError.conflict(
      'A candidate with a published result cannot be removed from the session',
      'NATIONAL_EXAM_RESULT_PUBLISHED',
    );
  }

  await withTransaction(async (client) => {
    await repository.deleteRegistration(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'DELETE',
        entityType: 'national_exam_registration',
        entityId: id,
        description: `Cancelled the registration of ${existing.student_name}`,
        oldValue: { studentId: existing.student_id, seatNumber: existing.seat_number },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

const buildResultDto = async (registrationId: number): Promise<NationalExamResultDto | null> => {
  const result = await repository.findLiveResult(registrationId);

  if (!result) {
    return null;
  }

  const scores = await repository.findSubjectScores(result.id);

  return {
    id: result.id,
    registrationId: result.registration_id,
    resultGrade: result.result_grade,
    totalScore: result.total_score,
    isPass: result.is_pass,
    publishedOn: result.published_on,
    amendmentReason: result.amendment_reason,
    supersededAt: null,
    subjectScores: scores.map((score) => ({
      subjectId: score.subject_id,
      subjectCode: score.subject_code ?? null,
      subjectName: score.subject_name ?? null,
      subjectNameKh: score.subject_name_kh ?? null,
      score: Number(score.score),
      maxScore: Number(score.max_score),
    })),
  };
};

export const getResult = async (registrationId: number): Promise<NationalExamResultDto | null> =>
  buildResultDto(registrationId);

export const getResultHistory = async (
  registrationId: number,
): Promise<NationalExamResultDto[]> => {
  const rows = await repository.findResultHistory(registrationId);

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      registrationId: row.registration_id,
      resultGrade: row.result_grade,
      totalScore: row.total_score,
      isPass: row.is_pass,
      publishedOn: row.published_on,
      amendmentReason: row.amendment_reason,
      supersededAt: row.superseded_at ? row.superseded_at.toISOString() : null,
      subjectScores: (await repository.findSubjectScores(row.id)).map((score) => ({
        subjectId: score.subject_id,
        subjectCode: score.subject_code ?? null,
        subjectName: score.subject_name ?? null,
        subjectNameKh: score.subject_name_kh ?? null,
        score: Number(score.score),
        maxScore: Number(score.max_score),
      })),
    })),
  );
};

/**
 * Publishes the Ministry's result for a candidate.
 *
 * A published result is immutable: publishing twice is refused, and a
 * correction goes through `amendResult`, which supersedes the old row rather
 * than overwriting it. A pass also graduates the student.
 */
export const publishResult = async (
  registrationId: number,
  input: PublishResultInput,
  context: AuditContext,
): Promise<NationalExamResultDto> => {
  const registration = await repository.findRegistrationById(registrationId);

  if (!registration) {
    throw AppError.notFound('Registration not found', 'NATIONAL_EXAM_REGISTRATION_NOT_FOUND');
  }

  const existing = await repository.findLiveResult(registrationId);

  if (existing) {
    throw AppError.conflict(
      'A result is already published for this candidate. Amend it instead of publishing again.',
      'NATIONAL_EXAM_RESULT_ALREADY_PUBLISHED',
    );
  }

  if (registration.status === 'ABSENT') {
    throw AppError.badRequest(
      'This candidate was marked absent and has no result to publish',
      'NATIONAL_EXAM_CANDIDATE_ABSENT',
    );
  }

  const isPass = input.isPass ?? isPassingGrade(input.resultGrade);

  await withTransaction(async (client) => {
    const result = await repository.insertResult(
      {
        registrationId,
        resultGrade: input.resultGrade,
        totalScore: input.totalScore ?? null,
        isPass,
        publishedOn: input.publishedOn ?? new Date().toISOString().slice(0, 10),
        publishedBy: context.userId,
        amendmentReason: null,
      },
      client,
    );

    if (input.subjectScores?.length) {
      await repository.insertSubjectScores(result.id, input.subjectScores, client);
    }

    await repository.updateRegistration(registrationId, { status: 'RESULT_PUBLISHED' }, client);

    // Passing the national examination completes the lower secondary cycle.
    if (isPass) {
      await studentRepository.updateStudent(registration.student_id, { status: 'GRADUATED' }, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'PUBLISH',
        entityType: 'national_exam_result',
        entityId: result.id,
        description: `Published national examination result for ${registration.student_name}: ${input.resultGrade}`,
        newValue: { resultGrade: input.resultGrade, totalScore: input.totalScore ?? null, isPass },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return (await buildResultDto(registrationId)) as NationalExamResultDto;
};

/**
 * Corrects a published result.
 *
 * The superseded row is kept and stamped, so the original stays readable and
 * the amendment is auditable. This is the only way a published result changes.
 */
export const amendResult = async (
  registrationId: number,
  input: AmendResultInput,
  context: AuditContext,
): Promise<NationalExamResultDto> => {
  const registration = await repository.findRegistrationById(registrationId);

  if (!registration) {
    throw AppError.notFound('Registration not found', 'NATIONAL_EXAM_REGISTRATION_NOT_FOUND');
  }

  const existing = await repository.findLiveResult(registrationId);

  if (!existing) {
    throw AppError.badRequest(
      'There is no published result to amend',
      'NATIONAL_EXAM_RESULT_NOT_PUBLISHED',
    );
  }

  const isPass = input.isPass ?? isPassingGrade(input.resultGrade);

  await withTransaction(async (client) => {
    await repository.supersedeResult(existing.id, context.userId, client);

    const result = await repository.insertResult(
      {
        registrationId,
        resultGrade: input.resultGrade,
        totalScore: input.totalScore ?? null,
        isPass,
        publishedOn: input.publishedOn ?? new Date().toISOString().slice(0, 10),
        publishedBy: context.userId,
        amendmentReason: input.reason,
      },
      client,
    );

    if (input.subjectScores?.length) {
      await repository.insertSubjectScores(result.id, input.subjectScores, client);
    }

    if (isPass) {
      await studentRepository.updateStudent(registration.student_id, { status: 'GRADUATED' }, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'national_exam_result',
        entityId: result.id,
        description: `Amended national examination result for ${registration.student_name}: ${existing.result_grade} → ${input.resultGrade}`,
        oldValue: {
          resultGrade: existing.result_grade,
          totalScore: existing.total_score,
          isPass: existing.is_pass,
        },
        newValue: {
          resultGrade: input.resultGrade,
          totalScore: input.totalScore ?? null,
          isPass,
          reason: input.reason,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return (await buildResultDto(registrationId)) as NationalExamResultDto;
};

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export const getSessionStatistics = async (sessionId: number): Promise<SessionStatisticsDto> => {
  const session = await repository.findSessionById(sessionId);

  if (!session) {
    throw AppError.notFound('National examination session not found', 'NATIONAL_EXAM_SESSION_NOT_FOUND');
  }

  const stats = await repository.findSessionStatistics(sessionId);

  return {
    sessionId,
    registered: stats.totals.registered,
    sat: stats.totals.sat,
    absent: stats.totals.absent,
    published: stats.totals.published,
    passed: stats.totals.passed,
    failed: stats.totals.published - stats.totals.passed,
    passRate: calculatePassRate(stats.totals.passed, stats.totals.published),
    byClass: stats.byClass.map((row) => ({
      classId: row.class_id,
      className: row.class_name,
      registered: row.registered,
      published: row.published,
      passed: row.passed,
      passRate: calculatePassRate(row.passed, row.published),
    })),
    byGrade: stats.byGrade.map((row) => ({
      resultGrade: row.result_grade as NationalExamGrade,
      count: row.count,
    })),
  };
};

/** The candidate list a school submits to the Ministry. */
export const getCandidateList = async (
  sessionId: number,
): Promise<{ session: NationalExamSessionDto; candidates: NationalExamRegistrationDto[] }> => {
  const session = await getSessionById(sessionId);
  const candidates = await listRegistrations({ sessionId });

  return { session, candidates };
};

/** Everything a Grade 9 student or their guardian may see about their own sitting. */
export const getRegistrationsForStudent = async (
  studentId: number,
): Promise<NationalExamRegistrationDto[]> => {
  const rows = await repository.findRegistrations({ studentId });

  return rows.map(toRegistrationDto);
};
