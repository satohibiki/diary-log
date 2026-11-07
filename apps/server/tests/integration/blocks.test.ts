import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { follows } from '../../src/platform/db/schema.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createUser, follow, loginAs } from '../helpers/users.ts';

const ctx = buildTestContext();
beforeEach(resetDb);
afterAll(closeDb);

describe('blocks', () => {
  it('removes follows in both directions and prevents new requests', async () => {
    const alice = await createUser(ctx, { handle: 'alice', visibility: 'public' });
    const bob = await createUser(ctx, { handle: 'bobby', visibility: 'public' });
    await follow(ctx, bob, alice);
    await follow(ctx, alice, bob, 'pending');
    const a = await loginAs(ctx, alice);
    const b = await loginAs(ctx, bob);

    expect((await a.put('/api/v1/me/blocks/bobby')).status).toBe(204);
    expect(await ctx.deps.db.select().from(follows)).toHaveLength(0);
    expect((await b.post('/api/v1/users/alice/follow')).status).toBe(404);
    expect((await a.post('/api/v1/users/bobby/follow')).status).toBe(404);
    const list = (await (await a.get('/api/v1/me/blocks')).json()) as { handle: string }[];
    expect(list.map((u) => u.handle)).toEqual(['bobby']);
  });

  it('can be undone', async () => {
    const alice = await createUser(ctx, { handle: 'alice' });
    await createUser(ctx, { handle: 'bobby' });
    const a = await loginAs(ctx, alice);
    await a.put('/api/v1/me/blocks/bobby');
    expect((await a.delete('/api/v1/me/blocks/bobby')).status).toBe(204);
    expect(await (await a.get('/api/v1/me/blocks')).json()).toEqual([]);
    expect((await a.get('/api/v1/users/bobby')).status).toBe(200);
  });

  it('returns 404 for unknown users', async () => {
    const a = await loginAs(ctx, await createUser(ctx, { handle: 'alice' }));
    expect((await a.put('/api/v1/me/blocks/nobody')).status).toBe(404);
  });
});
