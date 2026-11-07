import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { diaries, follows, passkeys, sessions, users } from '../../src/platform/db/schema.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createDiary } from '../helpers/diaries.ts';
import { registerUser, stepUp } from '../helpers/flows.ts';
import { createUser, follow, loginAs } from '../helpers/users.ts';

const ctx = buildTestContext();
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
});
afterAll(closeDb);

describe('DELETE /me', () => {
  it('requires a step-up', async () => {
    const { client } = await registerUser(ctx, 'alice');
    expect((await client.delete('/api/v1/me')).status).toBe(403);
  });

  it('deletes all of the user’s data and signs out', async () => {
    const { client, authenticator } = await registerUser(ctx, 'alice');
    await createDiary(client, '2026-11-01');
    const bob = await createUser(ctx, { handle: 'bobby' });
    const [alice] = await ctx.deps.db.select().from(users);
    if (!alice) throw new Error('alice がいません');
    await follow(ctx, bob, { id: alice.id, handle: 'alice', email: '' });
    await stepUp(client, authenticator);

    const res = await client.delete('/api/v1/me');
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().join()).toContain('Max-Age=0');

    const db = ctx.deps.db;
    expect((await db.select().from(users)).map((u) => u.handle)).toEqual(['bobby']);
    expect(await db.select().from(diaries)).toHaveLength(0);
    expect(await db.select().from(passkeys)).toHaveLength(0);
    expect(await db.select().from(follows)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);

    const b = await loginAs(ctx, bob);
    expect((await b.get('/api/v1/users/alice')).status).toBe(404);
    expect((await b.get('/api/v1/users/alice/avatar')).status).toBe(404);
  });
});
