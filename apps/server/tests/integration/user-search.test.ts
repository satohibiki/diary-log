import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { block, createUser, loginAs } from '../helpers/users.ts';

// 回数制限の時間枠の境界をまたがないよう、時刻を固定する
const ctx = buildTestContext({ now: () => new Date('2026-11-07T00:00:10Z') });
beforeEach(resetDb);
afterAll(closeDb);

describe('GET /users/:handle', () => {
  it('finds a user by exact ID and returns only the public profile', async () => {
    await createUser(ctx, { handle: 'alice', nickname: 'ありす', email: 'alice-secret@example.com', visibility: 'public' });
    const b = await loginAs(ctx, await createUser(ctx, { handle: 'bobby' }));
    const res = await b.get('/api/v1/users/alice');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ handle: 'alice', nickname: 'ありす', hasAvatar: false });
    expect(JSON.stringify(body)).not.toContain('alice-secret@example.com');
    expect(JSON.stringify(body)).not.toContain('public');
  });

  it('does not do partial matches', async () => {
    await createUser(ctx, { handle: 'alice' });
    const b = await loginAs(ctx, await createUser(ctx, { handle: 'bobby' }));
    expect((await b.get('/api/v1/users/ali')).status).toBe(404);
  });

  it('returns 404 across a block in either direction', async () => {
    const alice = await createUser(ctx, { handle: 'alice' });
    const bob = await createUser(ctx, { handle: 'bobby' });
    await block(ctx, alice, bob);
    const b = await loginAs(ctx, bob);
    const a = await loginAs(ctx, alice);
    expect((await b.get('/api/v1/users/alice')).status).toBe(404);
    expect((await a.get('/api/v1/users/bobby')).status).toBe(404);
  });

  it('limits lookups to 30 per minute', async () => {
    const b = await loginAs(ctx, await createUser(ctx, { handle: 'bobby' }));
    for (let i = 0; i < 30; i += 1) await b.get('/api/v1/users/nobody');
    expect((await b.get('/api/v1/users/nobody')).status).toBe(429);
  });

  it('requires sign-in', async () => {
    expect((await ctx.client().get('/api/v1/users/alice')).status).toBe(401);
  });
});
