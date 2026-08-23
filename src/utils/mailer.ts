import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config';
import { logger } from './logger';

/**
 * Outgoing mail.
 *
 * When SMTP is not configured the mailer does not throw and does not pretend to
 * have sent anything: it logs the message, including the code, so a developer
 * can complete a password reset locally without credentials. Production is
 * expected to configure SMTP; `env.mailEnabled` says which mode is active.
 */

let transporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  if (!env.mailEnabled) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // Port 465 is implicit TLS; 587 upgrades with STARTTLS.
      secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER as string, pass: env.SMTP_PASSWORD as string },
    });
  }

  return transporter;
};

const fromAddress = (): string => {
  const address = env.MAIL_FROM_ADDRESS ?? env.SMTP_USER ?? 'no-reply@school.local';

  return `"${env.MAIL_FROM_NAME}" <${address}>`;
};

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends a message. Never throws: a school workflow must not fail because the
 * mail server is briefly unavailable, so a failure is logged and reported back
 * as `false` for the caller to react to if it cares.
 */
export const sendMail = async (message: MailMessage): Promise<boolean> => {
  const mail = getTransporter();

  if (!mail) {
    logger.warn('SMTP is not configured; the message was logged instead of sent', {
      to: message.to,
      subject: message.subject,
      body: message.text,
    });

    return false;
  }

  try {
    await mail.sendMail({
      from: fromAddress(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    logger.info('Mail sent', { to: message.to, subject: message.subject });

    return true;
  } catch (error) {
    logger.error('Could not send mail', { to: message.to, subject: message.subject, error });

    return false;
  }
};

/** Hides most of an address, for logs and for telling a user where a code went. */
export const maskEmail = (email: string): string => {
  const [name, domain] = email.split('@');

  if (!domain) {
    return '•••';
  }

  const visible = name.slice(0, Math.min(2, name.length));

  return `${visible}${'•'.repeat(Math.max(name.length - visible.length, 3))}@${domain}`;
};

/** The password reset code email, in both languages the school uses. */
export const passwordResetCodeMail = (
  code: string,
  minutes: number,
): Omit<MailMessage, 'to'> => ({
  subject: `${code} — password reset code / លេខកូដកំណត់ពាក្យសម្ងាត់ថ្មី`,
  text: [
    `Your password reset code is ${code}.`,
    `It expires in ${minutes} minutes and can be used once.`,
    'If you did not ask to reset your password, you can ignore this message.',
    '',
    `លេខកូដកំណត់ពាក្យសម្ងាត់ថ្មីរបស់អ្នកគឺ ${code}។`,
    `វាផុតកំណត់ក្នុងរយៈពេល ${minutes} នាទី និងប្រើបានតែម្តងគត់។`,
    'ប្រសិនបើអ្នកមិនបានស្នើសុំកំណត់ពាក្យសម្ងាត់ថ្មី សូមមិនអើពើនឹងសាររបស់នេះ។',
  ].join('\n'),
  html: `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a">${env.MAIL_FROM_NAME}</h2>
      <p style="margin:0 0 24px;font-size:13px;color:#64748b">Password reset · កំណត់ពាក្យសម្ងាត់ថ្មី</p>

      <div style="background:#f1f5f9;border-radius:12px;padding:20px;text-align:center">
        <p style="margin:0 0 8px;font-size:13px;color:#475569">Your code</p>
        <p style="margin:0;font-size:32px;font-weight:600;letter-spacing:8px;color:#0f172a">${code}</p>
      </div>

      <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#334155">
        It expires in ${minutes} minutes and can be used once.<br>
        វាផុតកំណត់ក្នុងរយៈពេល ${minutes} នាទី និងប្រើបានតែម្តងគត់។
      </p>

      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b">
        If you did not ask to reset your password, you can ignore this message.<br>
        ប្រសិនបើអ្នកមិនបានស្នើសុំ សូមមិនអើពើនឹងសារនេះ។
      </p>
    </div>
  `,
});
