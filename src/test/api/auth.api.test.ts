import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../../config';
import { asUser, closeDatabase, describeApi, getApp, login } from '../integration';
import type { Session } from '../integration';

describeApi('POST /api/v1/auth/login', () => {
  afterAll(closeDatabase);

  it('returns tokens and the signed-in user for correct credentials', async () => {
    const response = await request(getApp()).post('/api/v1/auth/login').send({
      identifier: env.SEED_SUPER_ADMIN_USERNAME,
      password: env.SEED_SUPER_ADMIN_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(response.body.data.user.username).toBe(env.SEED_SUPER_ADMIN_USERNAME);
    expect(response.body.data.user.roles).toContain('SUPER_ADMIN');
  });

  it('never returns the password hash', async () => {
    const response = await request(getApp()).post('/api/v1/auth/login').send({
      identifier: env.SEED_SUPER_ADMIN_USERNAME,
      password: env.SEED_SUPER_ADMIN_PASSWORD,
    });

    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('password_hash');
  });

  it('accepts the email address as the identifier', async () => {
    const response = await request(getApp()).post('/api/v1/auth/login').send({
      identifier: env.SEED_SUPER_ADMIN_EMAIL,
      password: env.SEED_SUPER_ADMIN_PASSWORD,
    });

    expect(response.status).toBe(200);
  });

  it('rejects a wrong password with 401 and no hint about which field was wrong', async () => {
    const response = await request(getApp())
      .post('/api/v1/auth/login')
      .send({ identifier: env.SEED_SUPER_ADMIN_USERNAME, password: 'WrongPassword1' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message.toLowerCase()).not.toContain('password is');
  });

  it('rejects an unknown user with the same 401 as a wrong password', async () => {
    const response = await request(getApp())
      .post('/api/v1/auth/login')
      .send({ identifier: 'nobody-at-all', password: 'WrongPassword1' });

    expect(response.status).toBe(401);
  });

  it('rejects a malformed body with a field level validation error', async () => {
    const response = await request(getApp()).post('/api/v1/auth/login').send({ identifier: '' });

    expect(response.status).toBe(422);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: expect.any(String) })]),
    );
  });
});

describeApi('authenticated access', () => {
  let session: Session;

  beforeAll(async () => {
    session = await login();
  });

  afterAll(closeDatabase);

  it('GET /auth/me returns the current user with roles and permissions', async () => {
    const response = await asUser(session).get('/api/v1/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.data.username).toBe(env.SEED_SUPER_ADMIN_USERNAME);
    expect(Array.isArray(response.body.data.permissions)).toBe(true);
  });

  it('refuses a protected route without a token', async () => {
    const response = await request(getApp()).get('/api/v1/students');

    expect(response.status).toBe(401);
  });

  it('refuses a protected route with a forged token', async () => {
    const response = await request(getApp())
      .get('/api/v1/students')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
  });

  it('exchanges a refresh token for a new pair and rotates the old one away', async () => {
    const fresh = await login();

    const first = await request(getApp())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: fresh.refreshToken });

    expect(first.status).toBe(200);
    expect(first.body.data.accessToken).toEqual(expect.any(String));

    const replay = await request(getApp())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: fresh.refreshToken });

    expect(replay.status).toBe(401);
  });

  it('logs out so the refresh token can no longer be used', async () => {
    const fresh = await login();

    const logout = await asUser(fresh)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: fresh.refreshToken });

    expect(logout.status).toBe(200);

    const refresh = await request(getApp())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: fresh.refreshToken });

    expect(refresh.status).toBe(401);
  });

  it('answers 404 in the API envelope for an unknown route', async () => {
    const response = await asUser(session).get('/api/v1/not-a-real-module');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
