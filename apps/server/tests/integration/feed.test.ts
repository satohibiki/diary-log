import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { canViewDiaries } from '../../src/social/view-policy.ts';
import { buildTestContext, type TestClient } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createDiary } from '../helpers/diaries.ts';
import { block, createUser, follow, loginAs, type TestUser } from '../helpers/users.ts';

const ctx = buildTestContext({ now: () => new Date('2027-01-01T00:00:00Z') });
beforeEach(resetDb);
afterAll(closeDb);

type Page = { items: { date: string; body: string; author: { handle: string } }[]; nextCursor: string | null };

async function feed(client: TestClient, query = '') {
  const res = await client.get(`/api/v1/feed${query}`);
  expect(res.headers.get('cache-control')).toBe('no-store');
  return (await res.json()) as Page;
}

describe('GET /feed', () => {
  it('lists viewable diaries of followed users, newest first, excluding my own', async () => {
    const me = await createUser(ctx, { handle: 'viewer' });
    const alice = await createUser(ctx, { handle: 'alice', visibility: 'public' });
    const carol = await createUser(ctx, { handle: 'carol', visibility: 'public' });
    await follow(ctx, me, alice);
    await follow(ctx, me, carol);
    await createDiary(await loginAs(ctx, alice), '2026-11-01', 'a1');
    await createDiary(await loginAs(ctx, carol), '2026-11-03', 'c3');
    await createDiary(await loginAs(ctx, alice), '2026-11-02', 'a2');
    const v = await loginAs(ctx, me);
    await createDiary(v, '2026-11-04', 'mine');
    const page = await feed(v);
    expect(page.items.map((d) => d.body)).toEqual(['c3', 'a2', 'a1']);
  });

  it('paginates with a cursor (limit 1 to 50)', async () => {
    const me = await createUser(ctx, { handle: 'viewer' });
    const alice = await createUser(ctx, { handle: 'alice', visibility: 'public' });
    await follow(ctx, me, alice);
    const a = await loginAs(ctx, alice);
    for (const d of ['2026-11-01', '2026-11-02', '2026-11-03']) await createDiary(a, d, d);
    const v = await loginAs(ctx, me);
    const first = await feed(v, '?limit=2');
    expect(first.items.map((d) => d.date)).toEqual(['2026-11-03', '2026-11-02']);
    const second = await feed(v, `?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`);
    expect(second.items.map((d) => d.date)).toEqual(['2026-11-01']);
    expect(second.nextCursor).toBeNull();
    expect((await v.get('/api/v1/feed?limit=51')).status).toBe(422);
    expect((await v.get('/api/v1/feed?limit=0')).status).toBe(422);
  });

  it('hides diaries immediately after the owner turns private or blocks', async () => {
    const me = await createUser(ctx, { handle: 'viewer' });
    const alice = await createUser(ctx, { handle: 'alice', visibility: 'public' });
    await follow(ctx, me, alice);
    const a = await loginAs(ctx, alice);
    await createDiary(a, '2026-11-01');
    const v = await loginAs(ctx, me);
    expect((await feed(v)).items).toHaveLength(1);
    await a.patch('/api/v1/me', { visibility: 'private' });
    expect((await feed(v)).items).toHaveLength(0);
    await a.patch('/api/v1/me', { visibility: 'public' });
    await a.put('/api/v1/me/blocks/viewer');
    expect((await feed(v)).items).toHaveLength(0);
  });

  it('agrees with canViewDiaries for every combination', async () => {
    type Setup = { visibility: 'private' | 'public'; follow?: 'pending' | 'approved'; block?: 'owner' | 'viewer' };
    const cases: Setup[] = [
      { visibility: 'public', follow: 'approved' },
      { visibility: 'public' },
      { visibility: 'public', follow: 'pending' },
      { visibility: 'private', follow: 'approved' },
      { visibility: 'public', follow: 'approved', block: 'owner' },
      { visibility: 'public', follow: 'approved', block: 'viewer' },
    ];
    for (const [i, c] of cases.entries()) {
      await resetDb();
      const viewer = await createUser(ctx, { handle: 'viewer' });
      const owner: TestUser = await createUser(ctx, { handle: `owner${String(i)}`, visibility: c.visibility });
      await createDiary(await loginAs(ctx, owner), '2026-11-01');
      if (c.follow) await follow(ctx, viewer, owner, c.follow);
      if (c.block === 'owner') await block(ctx, owner, viewer);
      if (c.block === 'viewer') await block(ctx, viewer, owner);
      const inFeed = (await feed(await loginAs(ctx, viewer))).items.length === 1;
      expect(inFeed).toBe(await canViewDiaries(ctx.deps.db, viewer.id, owner.id));
    }
  });
});

describe('GET /users/:handle/diaries', () => {
  it('lists a viewable user’s diaries and returns 404 otherwise', async () => {
    const me = await createUser(ctx, { handle: 'viewer' });
    const alice = await createUser(ctx, { handle: 'alice', visibility: 'public' });
    const a = await loginAs(ctx, alice);
    await createDiary(a, '2026-11-01', 'one');
    await createDiary(a, '2026-11-02', 'two');
    const v = await loginAs(ctx, me);
    expect((await v.get('/api/v1/users/alice/diaries')).status).toBe(404);
    await follow(ctx, me, alice);
    const res = await v.get('/api/v1/users/alice/diaries');
    expect(res.status).toBe(200);
    expect(((await res.json()) as Page).items.map((d) => d.body)).toEqual(['two', 'one']);
  });
});
