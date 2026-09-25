import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : value.toLowerCase() === 'true'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanFromString.default(false),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(10_000),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('1d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(48),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Rate limiting is off unless this is explicitly turned on. */
  RATE_LIMIT_ENABLED: booleanFromString.default(false),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  // Outgoing mail. With no SMTP host configured the mailer logs the message
  // instead of sending it, so development works without credentials.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromString.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM_NAME: z.string().default('Hun Sen Turey Secondary School'),
  MAIL_FROM_ADDRESS: z.string().optional(),

  /** Length and lifetime of the emailed password reset code. */
  PASSWORD_RESET_CODE_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
  PASSWORD_RESET_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),

  // Homework attachments. Files live on disk rather than in the database: a
  // photograph of a page of exercises is large, is never queried, and is always
  // served whole.
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(10),

  // Cloudinary image hosting (student and teacher photos). Optional: without
  // all three values the Cloudinary client is left unconfigured.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  SEED_SUPER_ADMIN_USERNAME: z.string().default('superadmin'),
  SEED_SUPER_ADMIN_EMAIL: z.string().email().default('superadmin@school.local'),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${details}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isDevelopment: raw.NODE_ENV === 'development',
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  /** True when SMTP is configured; otherwise mail is written to the log. */
  mailEnabled: Boolean(raw.SMTP_HOST && raw.SMTP_USER && raw.SMTP_PASSWORD),
  /** Absolute path to the upload directory, resolved once at start-up. */
  uploadDir: path.isAbsolute(raw.UPLOAD_DIR)
    ? raw.UPLOAD_DIR
    : path.resolve(process.cwd(), raw.UPLOAD_DIR),
  maxUploadBytes: Math.round(raw.MAX_UPLOAD_MB * 1024 * 1024),
  /** True when all three Cloudinary credentials are configured. */
  cloudinaryEnabled: Boolean(
    raw.CLOUDINARY_CLOUD_NAME && raw.CLOUDINARY_API_KEY && raw.CLOUDINARY_API_SECRET,
  ),
  /** CORS_ORIGIN supports a comma separated list of allowed origins. */
  corsOrigins: raw.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
};

export type Env = typeof env;
