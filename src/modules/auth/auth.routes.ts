import { Router } from 'express';
import { authenticate, authRateLimiter, validate } from '../../middleware';
import * as authController from './auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schema';

const router = Router();

router.post('/login', authRateLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', validate({ body: refreshSchema }), authController.refresh);

router.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);

router.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);

router.post('/verify-email', validate({ body: verifyEmailSchema }), authController.verifyEmail);

router.post(
  '/resend-verification',
  authRateLimiter,
  validate({ body: resendVerificationSchema }),
  authController.resendVerification,
);

router.use(authenticate);

router.get('/me', authController.me);
router.post('/logout', validate({ body: logoutSchema }), authController.logout);
router.post(
  '/change-password',
  validate({ body: changePasswordSchema }),
  authController.changePassword,
);

export default router;
