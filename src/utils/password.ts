import bcrypt from 'bcrypt';
import { env } from '../config';

/** Hashes a plain text password with bcrypt. */
export const hashPassword = async (plainPassword: string): Promise<string> =>
  bcrypt.hash(plainPassword, env.BCRYPT_SALT_ROUNDS);

/** Constant-time comparison of a plain password against a stored hash. */
export const verifyPassword = async (
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> => bcrypt.compare(plainPassword, passwordHash);

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*';

/**
 * Generates a temporary password that satisfies the password policy. Used when an
 * administrator resets an account and no self-service email delivery is configured.
 */
export const generateTemporaryPassword = (length = 12): string => {
  const alphabet = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;
  const required = [
    UPPERCASE[Math.floor(Math.random() * UPPERCASE.length)],
    LOWERCASE[Math.floor(Math.random() * LOWERCASE.length)],
    DIGITS[Math.floor(Math.random() * DIGITS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
  ];

  const remaining = Array.from({ length: Math.max(length - required.length, 4) }, () => {
    return alphabet[Math.floor(Math.random() * alphabet.length)];
  });

  return [...required, ...remaining]
    .sort(() => Math.random() - 0.5)
    .join('');
};
