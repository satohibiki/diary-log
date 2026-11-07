import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createDiary } from '../helpers/diaries.ts';
import { createUser, loginAs } from '../helpers/users.ts';

const ctx = buildTestContext({ now: () => new Date('2027-01-01T00:00:00Z') });
beforeEach(resetDb);
afterAll(closeDb);

async function pair() {
  const alice = await createUser(ctx, { handle: 'alice', visibility: 'public' });
  const bob = await createUser(ctx, { handle: 'bobby' });
  const a = await loginAs(ctx, alice);
  const b = await loginAs(ctx, bob);
  await createDiary(a, '2026-11-01', 'ありすの にっき');
  return { a, b };
}

type FollowList = { approved: { handle: string }[]; pending: { handle: string }[] };
const handles = (list: { handle: string }[]) => list.map((u) => u.handle);

describe('follows', () => {
  it('requests, waits for approval, and then shows diaries', async () => {
    const { a, b } = await pair();
    expect((await b.post('/api/v1/users/alice/follow')).status).toBe(202);
    expect((await b.get('/api/v1/users/alice/diaries/2026-11-01')).status).toBe(404);
    const following = (await (await b.get('/api/v1/me/following')).json()) as FollowList;
    expect(handles(following.pending)).toEqual(['alice']);
    const followers = (await (await a.get('/api/v1/me/followers')).json()) as FollowList;
    expect(handles(followers.pending)).toEqual(['bobby']);

    expect((await a.post('/api/v1/me/followers/bobby/approve')).status).toBe(204);
    expect((await b.get('/api/v1/users/alice/diaries/2026-11-01')).status).toBe(200);
    expect(handles(((await (await a.get('/api/v1/me/followers')).json()) as FollowList).approved)).toEqual(['bobby']);
  });

  it('rejects a request without creating a follow', async () => {
    const { a, b } = await pair();
    await b.post('/api/v1/users/alice/follow');
    expect((await a.delete('/api/v1/me/followers/bobby')).status).toBe(204);
    expect((await (await b.get('/api/v1/me/following')).json()) as FollowList).toEqual({ approved: [], pending: [] });
  });

  it('lets the requester cancel and later unfollow', async () => {
    const { a, b } = await pair();
    await b.post('/api/v1/users/alice/follow');
    expect((await b.delete('/api/v1/users/alice/follow')).status).toBe(204);
    expect(((await (await a.get('/api/v1/me/followers')).json()) as FollowList).pending).toEqual([]);
    await b.post('/api/v1/users/alice/follow');
    await a.post('/api/v1/me/followers/bobby/approve');
    await b.delete('/api/v1/users/alice/follow');
    expect((await b.get('/api/v1/users/alice/diaries/2026-11-01')).status).toBe(404);
  });

  it('lets the owner remove an approved follower', async () => {
    const { a, b } = await pair();
    await b.post('/api/v1/users/alice/follow');
    await a.post('/api/v1/me/followers/bobby/approve');
    await a.delete('/api/v1/me/followers/bobby');
    expect((await b.get('/api/v1/users/alice/diaries/2026-11-01')).status).toBe(404);
  });

  it('rejects duplicate requests, self-follows, and unknown users', async () => {
    const { b } = await pair();
    await b.post('/api/v1/users/alice/follow');
    expect((await b.post('/api/v1/users/alice/follow')).status).toBe(409);
    expect((await b.post('/api/v1/users/bobby/follow')).status).toBe(409);
    expect((await b.post('/api/v1/users/nobody/follow')).status).toBe(404);
  });

  it('returns 404 when approving a request that does not exist', async () => {
    const { a } = await pair();
    expect((await a.post('/api/v1/me/followers/bobby/approve')).status).toBe(404);
  });
});
