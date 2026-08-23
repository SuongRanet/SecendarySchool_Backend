import type { Request, Response } from 'express';
import { isElevated } from '../../middleware/role.middleware';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { AppError } from '../../utils/app-error';
import { getAuditContext, requireUser } from '../../utils/request-context';
import * as parentRepository from '../parents/parent.repository';
import * as service from './national-exam.service';
import type {
  AmendResultBody,
  CreateSessionBody,
  ListRegistrationsQuery,
  ListSessionsQuery,
  PublishResultBody,
  RegisterCandidateBody,
  UpdateRegistrationBody,
  UpdateSessionBody,
} from './national-exam.schema';

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListSessionsQuery;
  const sessions = await service.listSessions(query.academicYearId);

  return sendSuccess(res, sessions, 'National examination sessions loaded successfully');
});

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await service.getSessionById(Number(req.params.id));

  return sendSuccess(res, session, 'National examination session loaded successfully');
});

export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateSessionBody;
  const session = await service.createSession(body, getAuditContext(req));

  return sendCreated(res, session, 'National examination session created successfully');
});

export const updateSession = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateSessionBody;
  const session = await service.updateSession(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, session, 'National examination session updated successfully');
});

export const deleteSession = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteSession(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'National examination session deleted successfully');
});

export const getStatistics = asyncHandler(async (req: Request, res: Response) => {
  const stats = await service.getSessionStatistics(Number(req.params.id));

  return sendSuccess(res, stats, 'National examination statistics loaded successfully');
});

export const getCandidateList = asyncHandler(async (req: Request, res: Response) => {
  const list = await service.getCandidateList(Number(req.params.id));

  return sendSuccess(res, list, 'Candidate list loaded successfully');
});

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

/**
 * A student sees only their own sitting, and a guardian only their children's.
 * Staff see whatever the query asks for.
 */
export const listRegistrations = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = req.query as unknown as ListRegistrationsQuery;

  if (user.studentId && !isElevated(user) && !user.teacherId) {
    const registrations = await service.getRegistrationsForStudent(user.studentId);

    return sendSuccess(res, registrations, 'National examination registrations loaded successfully');
  }

  if (user.parentId && !isElevated(user) && !user.teacherId) {
    if (!query.studentId) {
      throw AppError.badRequest('Select a child first', 'STUDENT_ID_REQUIRED');
    }

    const isLinked = await parentRepository.isLinkedToStudent(user.parentId, query.studentId);

    if (!isLinked) {
      throw AppError.forbidden('This student is not linked to your account', 'CHILD_ACCESS_DENIED');
    }

    const registrations = await service.getRegistrationsForStudent(query.studentId);

    return sendSuccess(res, registrations, 'National examination registrations loaded successfully');
  }

  const registrations = await service.listRegistrations(query);

  return sendSuccess(res, registrations, 'National examination registrations loaded successfully');
});

export const getRegistration = asyncHandler(async (req: Request, res: Response) => {
  const registration = await service.getRegistrationById(Number(req.params.id));

  return sendSuccess(res, registration, 'Registration loaded successfully');
});

export const registerCandidate = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RegisterCandidateBody;
  const registration = await service.registerCandidate(
    Number(req.params.id),
    body,
    getAuditContext(req),
  );

  return sendCreated(res, registration, 'Candidate registered successfully');
});

export const registerResit = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RegisterCandidateBody;
  const registration = await service.registerResit(
    Number(req.params.id),
    body,
    getAuditContext(req),
  );

  return sendCreated(res, registration, 'Resit registered successfully');
});

export const updateRegistration = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateRegistrationBody;
  const registration = await service.updateRegistration(
    Number(req.params.id),
    body,
    getAuditContext(req),
  );

  return sendSuccess(res, registration, 'Registration updated successfully');
});

export const cancelRegistration = asyncHandler(async (req: Request, res: Response) => {
  await service.cancelRegistration(Number(req.params.id), getAuditContext(req));

  return sendNoContent(res, 'Registration cancelled successfully');
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export const getResult = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getResult(Number(req.params.id));

  return sendSuccess(res, result, 'Result loaded successfully');
});

export const getResultHistory = asyncHandler(async (req: Request, res: Response) => {
  const history = await service.getResultHistory(Number(req.params.id));

  return sendSuccess(res, history, 'Result history loaded successfully');
});

export const publishResult = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as PublishResultBody;
  const result = await service.publishResult(Number(req.params.id), body, getAuditContext(req));

  return sendCreated(res, result, 'Result published successfully');
});

export const amendResult = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as AmendResultBody;
  const result = await service.amendResult(Number(req.params.id), body, getAuditContext(req));

  return sendSuccess(res, result, 'Result amended successfully');
});

/** The signed-in student's own national examination record. */
export const getMine = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  if (!user.studentId) {
    throw AppError.notFound('No student profile is linked to this account', 'STUDENT_NOT_FOUND');
  }

  const registrations = await service.getRegistrationsForStudent(user.studentId);

  return sendSuccess(res, registrations, 'National examination record loaded successfully');
});
