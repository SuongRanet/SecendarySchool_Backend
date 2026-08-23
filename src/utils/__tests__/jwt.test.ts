import { describe, expect, it } from 'vitest';
import {
  durationToDate,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../jwt';

describe('access and refresh tokens', () => {
  it('round-trips an access token payload', () => {
    const token = signAccessToken({ sub: 7, username: 'sokha', roles: ['TEACHER'] });
    const payload = verifyAccessToken(token);

    expect(payload.sub).toBe(7);
    expect(payload.username).toBe('sokha');
    expect(payload.roles).toEqual(['TEACHER']);
    expect(payload.type).toBe('access');
  });

  it('round-trips a refresh token payload', () => {
    const token = signRefreshToken({ sub: 7, jti: 'abc-123' });
    const payload = verifyRefreshToken(token);

    expect(payload.sub).toBe(7);
    expect(payload.jti).toBe('abc-123');
    expect(payload.type).toBe('refresh');
  });

  it('refuses a refresh token presented as an access token', () => {
    const refresh = signRefreshToken({ sub: 7, jti: 'abc-123' });

    expect(() => verifyAccessToken(refresh)).toThrow();
  });

  it('refuses an access token presented as a refresh token', () => {
    const access = signAccessToken({ sub: 7, username: 'sokha', roles: ['TEACHER'] });

    expect(() => verifyRefreshToken(access)).toThrow();
  });

  it('refuses a token that is not a JWT at all', () => {
    expect(() => verifyAccessToken('not-a-token')).toThrow();
  });
});

describe('hashToken', () => {
  it('produces a stable sha256 hex digest', () => {
    expect(hashToken('opaque')).toBe(hashToken('opaque'));
    expect(hashToken('opaque')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a different digest for a different token', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('generateOpaqueToken', () => {
  it('returns hex of twice the requested byte length', () => {
    expect(generateOpaqueToken(16)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('does not repeat itself', () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });
});

describe('durationToDate', () => {
  const from = new Date('2026-01-01T00:00:00.000Z');

  it('adds minutes', () => {
    expect(durationToDate('15m', from).toISOString()).toBe('2026-01-01T00:15:00.000Z');
  });

  it('adds hours', () => {
    expect(durationToDate('24h', from).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('adds days', () => {
    expect(durationToDate('7d', from).toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('adds weeks', () => {
    expect(durationToDate('2w', from).toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('treats a bare number as seconds', () => {
    expect(durationToDate('3600', from).toISOString()).toBe('2026-01-01T01:00:00.000Z');
  });

  it('rejects an unsupported format', () => {
    expect(() => durationToDate('soon', from)).toThrow(/Unsupported duration format/);
  });
});
