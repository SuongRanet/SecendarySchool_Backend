import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../password';
import { passwordSchema } from '../../schemas/common.schema';

describe('password hashing', () => {
  it('verifies a password against its own hash', async () => {
    const hash = await hashPassword('Str0ngPass!');

    expect(await verifyPassword('Str0ngPass!', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Str0ngPass!');

    expect(await verifyPassword('str0ngpass!', hash)).toBe(false);
  });

  it('never stores the plain text', async () => {
    const hash = await hashPassword('Str0ngPass!');

    expect(hash).not.toContain('Str0ngPass!');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('salts, so the same password hashes differently each time', async () => {
    expect(await hashPassword('Str0ngPass!')).not.toBe(await hashPassword('Str0ngPass!'));
  });
});

describe('generateTemporaryPassword', () => {
  it('always satisfies the password policy', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(passwordSchema.safeParse(generateTemporaryPassword()).success).toBe(true);
    }
  });

  it('honours the requested length', () => {
    expect(generateTemporaryPassword(16)).toHaveLength(16);
  });

  it('never returns fewer characters than the policy minimum', () => {
    expect(generateTemporaryPassword(2).length).toBeGreaterThanOrEqual(8);
  });
});
