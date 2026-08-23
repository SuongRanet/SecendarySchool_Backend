import { z } from 'zod';
import { emailSchema, passwordSchema, requiredString } from '../../schemas/common.schema';

export const loginSchema = z.object({
  identifier: requiredString(255, 'Username or email'),
  password: z.string().min(1, 'Password is required').max(128),
});

export const refreshSchema = z.object({
  refreshToken: requiredString(1024, 'Refresh token'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().trim().max(1024).optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/** The emailed code: digits only, so a stray space or letter fails fast. */
const resetCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{4,10}$/, 'Enter the code from the email');

export const verifyResetCodeSchema = z.object({
  email: emailSchema,
  code: resetCodeSchema,
});

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    code: resetCodeSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    message: 'The new password must be different from the current password',
  });

export const verifyEmailSchema = z.object({
  token: requiredString(256, 'Verification token'),
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export type LoginBody = z.infer<typeof loginSchema>;
export type RefreshBody = z.infer<typeof refreshSchema>;
export type LogoutBody = z.infer<typeof logoutSchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
export type VerifyResetCodeBody = z.infer<typeof verifyResetCodeSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationBody = z.infer<typeof resendVerificationSchema>;
