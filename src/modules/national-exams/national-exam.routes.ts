import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { idParamSchema } from '../../schemas/common.schema';
import * as controller from './national-exam.controller';
import {
  amendResultSchema,
  createSessionSchema,
  listRegistrationsQuerySchema,
  listSessionsQuerySchema,
  publishResultSchema,
  registerCandidateSchema,
  updateRegistrationSchema,
  updateSessionSchema,
} from './national-exam.schema';

const router = Router();

router.use(authenticate);

// ---------------------------------------------------------------------------
// The signed-in student's own record — resolved from the token, never a path id
// ---------------------------------------------------------------------------
router.get('/me', controller.getMine);

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
router.get(
  '/sessions',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_VIEW),
  validate({ query: listSessionsQuerySchema }),
  controller.listSessions,
);

router.post(
  '/sessions',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_MANAGE),
  validate({ body: createSessionSchema }),
  controller.createSession,
);

router.get(
  '/sessions/:id',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_VIEW),
  validate({ params: idParamSchema }),
  controller.getSession,
);

router.patch(
  '/sessions/:id',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_MANAGE),
  validate({ params: idParamSchema, body: updateSessionSchema }),
  controller.updateSession,
);

router.delete(
  '/sessions/:id',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_MANAGE),
  validate({ params: idParamSchema }),
  controller.deleteSession,
);

router.get(
  '/sessions/:id/statistics',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_VIEW),
  validate({ params: idParamSchema }),
  controller.getStatistics,
);

/** The candidate list the school submits to the Ministry. */
router.get(
  '/sessions/:id/candidates',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_VIEW),
  validate({ params: idParamSchema }),
  controller.getCandidateList,
);

router.post(
  '/sessions/:id/registrations',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_MANAGE),
  validate({ params: idParamSchema, body: registerCandidateSchema }),
  controller.registerCandidate,
);

router.post(
  '/sessions/:id/resits',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_MANAGE),
  validate({ params: idParamSchema, body: registerCandidateSchema }),
  controller.registerResit,
);

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------
router.get(
  '/registrations',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_VIEW),
  validate({ query: listRegistrationsQuerySchema }),
  controller.listRegistrations,
);

router.get(
  '/registrations/:id',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_VIEW),
  validate({ params: idParamSchema }),
  controller.getRegistration,
);

router.patch(
  '/registrations/:id',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_MANAGE),
  validate({ params: idParamSchema, body: updateRegistrationSchema }),
  controller.updateRegistration,
);

router.delete(
  '/registrations/:id',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_MANAGE),
  validate({ params: idParamSchema }),
  controller.cancelRegistration,
);

// ---------------------------------------------------------------------------
// Results — publishing and amending are a separate permission from managing
// registrations, because a published result is externally issued and immutable
// ---------------------------------------------------------------------------
router.get(
  '/registrations/:id/result',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_VIEW),
  validate({ params: idParamSchema }),
  controller.getResult,
);

router.get(
  '/registrations/:id/result/history',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_VIEW),
  validate({ params: idParamSchema }),
  controller.getResultHistory,
);

router.post(
  '/registrations/:id/result',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_PUBLISH),
  validate({ params: idParamSchema, body: publishResultSchema }),
  controller.publishResult,
);

router.post(
  '/registrations/:id/result/amend',
  requirePermissions(PERMISSIONS.NATIONAL_EXAMS_PUBLISH),
  validate({ params: idParamSchema, body: amendResultSchema }),
  controller.amendResult,
);

export default router;
