import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { registerUser } from '../helpers/flows.ts';
import type { SoftwareAuthenticator } from '../helpers/software-authenticator.ts';

// 回数制限の時間枠の境界をまたがないよう、時刻を固定する
const ctx = buildTestContext({ now: () => new Date('2026-11-07T00:00:10Z') });
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
});
afterAll(closeDb);

async function login(handle: string, authenticator: SoftwareAuthenticator, ip = '203.0.113.1') {
  const client = ctx.client();
  const headers = { 'x-test-ip': ip };
  const opts = await client.request('POST', '/api/v1/auth/login/options', { headers });
  const { challengeId, options } = (await opts.json()) as { challengeId: string; options: { challenge: string } };
  const res = await client.request('POST', '/api/v1/auth/login/verify', {
    headers,
    json: { handle, challengeId, credential: authenticator.get(options) },
  });
  return { client, res };
}

describe('login', () => {
  it('signs in with ID and passkey', async () => {
    const { authenticator } = await registerUser(ctx, 'alice');
    const { client, res } = await login('alice', authenticator);
    expect(res.status).toBe(204);
    expect((await client.get('/api/v1/me')).status).toBe(200);
  });

  it('returns options that reveal nothing about IDs and contain no password', async () => {
    const res = await ctx.client().post('/api/v1/auth/login/options');
    const body = (await res.json()) as { options: { allowCredentials?: unknown[]; userVerification?: string } };
    expect(body.options.allowCredentials ?? []).toEqual([]);
    expect(body.options.userVerification).toBe('required');
    expect(JSON.stringify(body).toLowerCase()).not.toContain('password');
  });

  it('gives the same 401 for an unknown ID and for a passkey of another user', async () => {
    const alice = await registerUser(ctx, 'alice');
    await registerUser(ctx, 'bobby');
    const unknown = await login('nobody', alice.authenticator);
    const mismatch = await login('bobby', alice.authenticator);
    expect(unknown.res.status).toBe(401);
    expect(mismatch.res.status).toBe(401);
    expect(await unknown.res.json()).toEqual(await mismatch.res.json());
  });

  it('cannot reuse a challenge', async () => {
    const { authenticator } = await registerUser(ctx, 'alice');
    const client = ctx.client();
    const { challengeId, options } = (await (await client.post('/api/v1/auth/login/options')).json()) as {
      challengeId: string;
      options: { challenge: string };
    };
    const body = { handle: 'alice', challengeId, credential: authenticator.get(options) };
    expect((await client.post('/api/v1/auth/login/verify', body)).status).toBe(204);
    const replay = { ...body, credential: authenticator.get(options) };
    expect((await ctx.client().post('/api/v1/auth/login/verify', replay)).status).toBe(401);
  });

  it('limits attempts per IP and ID, without locking the owner out from another IP', async () => {
    const { authenticator } = await registerUser(ctx, 'alice');
    for (let i = 0; i < 5; i += 1) await login('alice', authenticator, '198.51.100.9');
    expect((await login('alice', authenticator, '198.51.100.9')).res.status).toBe(429);
    expect((await login('alice', authenticator, '203.0.113.50')).res.status).toBe(204);
  });

  it('logs out and invalidates the session', async () => {
    const { client } = await registerUser(ctx, 'alice');
    const res = await client.post('/api/v1/auth/logout');
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().join()).toContain('Max-Age=0');
    expect((await client.get('/api/v1/me')).status).toBe(401);
  });
});
