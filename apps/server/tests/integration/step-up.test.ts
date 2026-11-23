// 004: パスワードでの本人確認(research.md §7)
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createPasskeyUser, DEFAULT_PASSWORD, registerUser } from '../helpers/flows.ts';

const ctx = buildTestContext({ now: () => new Date('2026-11-07T00:00:10Z') });
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
});
afterAll(closeDb);

describe('POST /auth/step-up/password', () => {
  it('allows sensitive operations after the right password', async () => {
    const { client } = await registerUser(ctx, 'alice');
    expect((await client.post('/api/v1/me/passkeys/options')).status).toBe(403);
    expect((await client.post('/api/v1/auth/step-up/password', { password: DEFAULT_PASSWORD })).status).toBe(204);
    expect((await client.post('/api/v1/me/passkeys/options')).status).toBe(200);
  });

  it('rejects a wrong password, and a user without a password', async () => {
    const { client } = await registerUser(ctx, 'alice');
    expect((await client.post('/api/v1/auth/step-up/password', { password: 'wrong horse battery staple' })).status).toBe(401);
    expect((await client.post('/api/v1/me/passkeys/options')).status).toBe(403);
    const passkeyOnly = await createPasskeyUser(ctx, 'bobby');
    const res = await passkeyOnly.client.post('/api/v1/auth/step-up/password', { password: DEFAULT_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('limits attempts to five in 15 minutes', async () => {
    const { client } = await registerUser(ctx, 'alice');
    for (let i = 0; i < 5; i += 1) await client.post('/api/v1/auth/step-up/password', { password: 'wrong horse battery staple' });
    expect((await client.post('/api/v1/auth/step-up/password', { password: DEFAULT_PASSWORD })).status).toBe(429);
  });

  it('requires a signed-in session', async () => {
    expect((await ctx.client().post('/api/v1/auth/step-up/password', { password: DEFAULT_PASSWORD })).status).toBe(401);
  });
});
