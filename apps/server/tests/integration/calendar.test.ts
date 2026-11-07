import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createDiary } from '../helpers/diaries.ts';
import { createUser, loginAs } from '../helpers/users.ts';

const ctx = buildTestContext({ now: () => new Date('2027-01-01T00:00:00Z') });
beforeEach(resetDb);
afterAll(closeDb);

describe('GET /me/diaries?month=', () => {
  it('returns the dates with diaries in the month, including month boundaries', async () => {
    const alice = await loginAs(ctx, await createUser(ctx, { handle: 'alice' }));
    for (const date of ['2026-10-31', '2026-11-01', '2026-11-15', '2026-11-30', '2026-12-01']) {
      await createDiary(alice, date);
    }
    const res = await alice.get('/api/v1/me/diaries?month=2026-11');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ dates: ['2026-11-01', '2026-11-15', '2026-11-30'] });
  });

  it('does not include other users’ diaries', async () => {
    const alice = await loginAs(ctx, await createUser(ctx, { handle: 'alice' }));
    const bob = await loginAs(ctx, await createUser(ctx, { handle: 'bobby' }));
    await createDiary(bob, '2026-11-02');
    expect(await (await alice.get('/api/v1/me/diaries?month=2026-11')).json()).toEqual({ dates: [] });
  });

  it.each(['2026-13', '2026-1', 'abc', ''])('rejects the month %s with 422', async (month) => {
    const alice = await loginAs(ctx, await createUser(ctx, { handle: 'alice' }));
    expect((await alice.get(`/api/v1/me/diaries?month=${month}`)).status).toBe(422);
  });

  it('requires sign-in', async () => {
    expect((await ctx.client().get('/api/v1/me/diaries?month=2026-11')).status).toBe(401);
  });
});
