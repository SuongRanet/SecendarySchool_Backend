import type { Request, Response } from 'express';
import { sendNoContent, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getClientIp, getUserAgent, requireUser } from '../../utils/request-context';
import type {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  LogoutBody,
  RefreshBody,
  ResendVerificationBody,
  ResetPasswordBody,
  VerifyResetCodeBody,
  VerifyEmailBody,
} from './auth.schema';
import * as authService from './auth.service';

const metadataOf = (req: Request) => ({
  ipAddress: getClientIp(req),
  userAgent: getUserAgent(req),
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body as LoginBody;
  const result = await authService.login(identifier, password, metadataOf(req));

  return sendSuccess(res, result, 'Signed in successfully');
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as RefreshBody;
  const result = await authService.refresh(refreshToken, metadataOf(req));

  return sendSuccess(res, result, 'Session refreshed successfully');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { refreshToken } = req.body as LogoutBody;

  await authService.logout(user.id, refreshToken, metadataOf(req));

  return sendNoContent(res, 'Signed out successfully');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const profile = await authService.me(user.id);

  return sendSuccess(res, profile, 'Profile loaded successfully');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as ForgotPasswordBody;
  const result = await authService.forgotPassword(email);

  return sendSuccess(res, result, 'A reset code has been sent');
});

export const verifyResetCode = asyncHandler(async (req: Request, res: Response) => {
  const { email, code } = req.body as VerifyResetCodeBody;

  const result = await authService.verifyResetCode(email, code);

  return sendSuccess(res, result, 'Code confirmed');
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, code, password } = req.body as ResetPasswordBody;

  await authService.resetPassword(email, code, password, metadataOf(req));

  return sendNoContent(res, 'Password has been reset successfully');
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { currentPassword, newPassword } = req.body as ChangePasswordBody;

  await authService.changePassword(user.id, currentPassword, newPassword, metadataOf(req));

  return sendNoContent(res, 'Password has been changed successfully');
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as VerifyEmailBody;

  await authService.verifyEmail(token);

  return sendNoContent(res, 'Email verified successfully');
});

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as ResendVerificationBody;
  const result = await authService.resendVerification(email);

  return sendSuccess(
    res,
    result,
    'If the email requires verification, a new link has been issued',
  );
});
