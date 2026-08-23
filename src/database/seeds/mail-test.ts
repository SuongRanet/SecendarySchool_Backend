import { env } from '../../config';
import { closePool } from '../connection';
import { logger } from '../../utils/logger';
import { passwordResetCodeMail, sendMail } from '../../utils/mailer';

/**
 * Checks that outgoing mail actually works.
 *
 * Run it after putting SMTP credentials in `.env`:
 *
 *   npm run mail:test -- someone@gmail.com
 *
 * It reports the configuration it is using, sends the real password reset
 * message with a dummy code, and says plainly whether the server accepted it.
 */
const main = async (): Promise<void> => {
  const recipient = process.argv[2] ?? env.SMTP_USER ?? env.SEED_SUPER_ADMIN_EMAIL;

  // eslint-disable-next-line no-console
  console.log('\nOutgoing mail configuration');
  // eslint-disable-next-line no-console
  console.table([
    { setting: 'SMTP_HOST', value: env.SMTP_HOST ?? '(empty)' },
    { setting: 'SMTP_PORT', value: env.SMTP_PORT },
    { setting: 'SMTP_SECURE', value: env.SMTP_SECURE || env.SMTP_PORT === 465 },
    { setting: 'SMTP_USER', value: env.SMTP_USER ?? '(empty)' },
    { setting: 'SMTP_PASSWORD', value: env.SMTP_PASSWORD ? '(set)' : '(empty)' },
    { setting: 'MAIL_FROM_ADDRESS', value: env.MAIL_FROM_ADDRESS ?? env.SMTP_USER ?? '(empty)' },
    { setting: 'mail enabled', value: env.mailEnabled },
  ]);

  if (!env.mailEnabled) {
    logger.warn(
      'SMTP is not configured, so nothing can be sent. Set SMTP_HOST, SMTP_USER and ' +
        'SMTP_PASSWORD in backend/.env. For Gmail, SMTP_PASSWORD must be a 16 character ' +
        'App Password, not the account password, and the account needs 2-Step Verification on.',
    );

    return;
  }

  // eslint-disable-next-line no-console
  console.log(`\nSending a test message to ${recipient} ...\n`);

  const delivered = await sendMail({
    to: recipient,
    ...passwordResetCodeMail('123456', env.PASSWORD_RESET_TOKEN_TTL_MINUTES),
  });

  if (delivered) {
    logger.info(
      `The mail server accepted the message. Check ${recipient} — including the spam folder. ` +
        'Password reset codes will now go by email only and will no longer appear on screen.',
    );

    return;
  }

  logger.error(
    'The mail server refused the message. The error above says why; the usual causes are a ' +
      'wrong App Password, 2-Step Verification not enabled, or the wrong port.',
  );
};

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Mail test failed', error);
    await closePool();
    process.exit(1);
  });
