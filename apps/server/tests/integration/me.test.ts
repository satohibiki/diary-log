import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createUser, loginAs } from '../helpers/users.ts';

const ctx = buildTestContext();
beforeEach(resetDb);
afterAll(closeDb);

describe('GET /me', () => {
  it('returns 401 when not signed in', async () => {
    expect((await ctx.client().get('/api/v1/me')).status).toBe(401);
  });

  it('rejects a recovery-scope session', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const client = await loginAs(ctx, user, 'recovery');
    expect((await client.get('/api/v1/me')).status).toBe(401);
  });

  it('returns the account including the user’s own email', async () => {
    const user = await createUser(ctx, { handle: 'alice', nickname: 'ありす', email: 'alice@example.com' });
    const client = await loginAs(ctx, user);
    const res = await client.get('/api/v1/me');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      handle: 'alice',
      nickname: 'ありす',
      email: 'alice@example.com',
      visibility: 'private',
      hasAvatar: false,
    });
  });
});
