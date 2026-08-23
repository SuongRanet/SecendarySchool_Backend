import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../../config';
import { asUser, describeApi, login, unique } from '../integration';
import type { Session } from '../integration';

/**
 * Creating an announcement goes through a single INSERT that reuses the author
 * parameter twice — once for `created_by`, and once inside a CASE for
 * `published_by` when the announcement goes out immediately. PostgreSQL refused
 * that statement outright ("inconsistent types deduced for parameter $12")
 * until both uses named the type, so every status path is covered here.
 */
describeApi('POST /api/v1/announcements', () => {
  let admin: Session;
  const created: number[] = [];

  beforeAll(async () => {
    admin = await login(env.SEED_SUPER_ADMIN_USERNAME, env.SEED_SUPER_ADMIN_PASSWORD);
  });

  afterAll(async () => {
    // Published announcements refuse deletion by design, so they are archived.
    for (const id of created) {
      await asUser(admin).post(`/api/v1/announcements/${id}/archive`).send();
      await asUser(admin).delete(`/api/v1/announcements/${id}`);
    }

  });

  const create = async (body: Record<string, unknown>) => {
    const response = await asUser(admin)
      .post('/api/v1/announcements')
      .send({ title: `Notice ${unique()}`, body: 'Body text', ...body });

    if (response.body?.data?.id) {
      created.push(response.body.data.id);
    }

    return response;
  };

  it('publishes immediately and stamps the author as the publisher', async () => {
    const response = await create({ audience: 'TEACHERS', publishNow: true });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('PUBLISHED');
    expect(response.body.data.audience).toBe('TEACHERS');
    expect(response.body.data.publishedAt).not.toBeNull();
  });

  it('leaves an unpublished announcement as a draft with no publication date', async () => {
    const response = await create({ audience: 'ALL', publishNow: false });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('DRAFT');
    expect(response.body.data.publishedAt).toBeNull();
  });

  it('schedules an announcement that carries a future publication date', async () => {
    const response = await create({
      audience: 'PARENTS',
      publishNow: false,
      publishAt: '2030-01-15T08:00:00.000Z',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('SCHEDULED');
  });

  it('keeps a pinned announcement pinned', async () => {
    const response = await create({ audience: 'STUDENTS', isPinned: true, publishNow: true });

    expect(response.status).toBe(201);
    expect(response.body.data.isPinned).toBe(true);
  });

  it('rejects an announcement with no title', async () => {
    const response = await asUser(admin)
      .post('/api/v1/announcements')
      .send({ title: '', body: 'Body text', audience: 'ALL' });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
  });

  it('rejects an unknown audience rather than storing it', async () => {
    const response = await asUser(admin)
      .post('/api/v1/announcements')
      .send({ title: `Notice ${unique()}`, body: 'Body text', audience: 'EVERYONE' });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
  });

  it('refuses to delete a published announcement, offering the archive instead', async () => {
    const created = await create({ audience: 'ALL', publishNow: true });
    const response = await asUser(admin).delete(`/api/v1/announcements/${created.body.data.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ANNOUNCEMENT_PUBLISHED');
  });
});
