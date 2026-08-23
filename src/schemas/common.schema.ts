import { z } from 'zod';
import { MAX_LIMIT } from '../utils/pagination';

/** A positive integer path parameter such as `/students/:id`. */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('Identifier must be a positive integer'),
});

/** A named positive integer path parameter such as `/classes/:classId/students`. */
export const namedIdParamSchema = (key: string) =>
  z.object({
    [key]: z.coerce.number().int().positive('Identifier must be a positive integer'),
  });

/** Shared `page` / `limit` / `sortBy` / `sortOrder` query parameters. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
  sortBy: z.string().trim().min(1).optional(),
  sortOrder: z.enum(['asc', 'desc', 'ASC', 'DESC']).optional(),
});

/** A trimmed, non-empty string with a maximum length. */
export const requiredString = (max: number, field = 'Value') =>
  z
    .string({ required_error: `${field} is required` })
    .trim()
    .min(1, `${field} is required`)
    .max(max, `${field} must be at most ${max} characters`);

/** A trimmed string that becomes `undefined` when empty. */
export const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();

/** A nullable trimmed string — an explicit `null` clears the stored value. */
export const nullableString = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .transform((value) => (typeof value === 'string' && value.length === 0 ? null : value))
    .optional();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address')
  .max(255);

export const optionalEmailSchema = z
  .union([z.string().trim().toLowerCase().email('Invalid email address').max(255), z.literal(''), z.null()])
  .transform((value) => (value === '' ? null : value))
  .optional();

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9][0-9\s\-()]{5,29}$/, 'Invalid phone number')
  .max(30);

export const optionalPhoneSchema = z
  .union([phoneSchema, z.literal(''), z.null()])
  .transform((value) => (value === '' ? null : value))
  .optional();

/** `YYYY-MM-DD`. Dates are stored and returned as plain calendar dates. */
export const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use the YYYY-MM-DD format')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Date is not a valid calendar date');

export const optionalDateSchema = z
  .union([dateSchema, z.literal(''), z.null()])
  .transform((value) => (value === '' ? null : value))
  .optional();

/** `HH:MM` or `HH:MM:SS`. */
export const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Time must use the HH:MM format');

/**
 * The password policy: at least 8 characters with a lowercase letter, an
 * uppercase letter and a digit.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

/** Accepts `true` / `false` as strings from a query string. */
export const booleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
  .optional();

/** Accepts a comma separated list or a repeated query parameter. */
export const numberListSchema = z
  .union([z.string(), z.array(z.string()), z.array(z.number())])
  .transform((value): number[] => {
    if (Array.isArray(value)) {
      return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
    }

    return value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
  });
