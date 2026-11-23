// 004: パスキーでの登録の経路を削除したため、パスキーのログインのテストは createPasskeyUser で既存の利用者を作る
// (期待は変えない。SC-003)。パスワードでのログインと、初めて使う端末の確認(FR-015)を加えた
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internals } from '../../src/auth/password.ts';
import { SESSION_COOKIE } from '../../src/auth/session.ts';
import { DEVICE_COOKIE } from '../../src/auth/trusted-device.ts';
import { sessions, trustedDevices } from '../../src/platform/db/schema.ts';
import { buildTestContext, lastOtp } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createPasskeyUser, DEFAULT_PASSWORD, loginWithPassword, registerUser } from '../helpers/flows.ts';
import type { SoftwareAuthenticator } from '../helpers/software-authenticator.ts';

// 回数制限の時間枠の境界をまたがないよう、時刻を固定する
const ctx = buildTestContext({ now: () => new Date('2026-11-07T00:00:10Z') });
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
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

/** 登録した端末の確認済みの Cookie を返す(ログアウトしても残る) */
async function registered(handle = 'alice') {
  const user = await registerUser(ctx, handle);
  const deviceToken = user.client.cookies.get(DEVICE_COOKIE);
  if (!deviceToken) throw new Error('確認済みの端末の Cookie がありません');
  ctx.outbox.length = 0;
  return { ...user, deviceToken };
}

describe('login with a passkey', () => {
  it('signs in with ID and passkey', async () => {
    const { authenticator } = await createPasskeyUser(ctx, 'alice');
    const { client, res } = await login('alice', authenticator);
    expect(res.status).toBe(204);
    expect((await client.get('/api/v1/me')).status).toBe(200);
  });

  it('does not ask a new device for a one-time password', async () => {
    const { authenticator } = await createPasskeyUser(ctx, 'alice');
    const { res } = await login('alice', authenticator);
    expect(res.status).toBe(204);
    expect(ctx.outbox).toHaveLength(0);
  });

  it('returns options that reveal nothing about IDs', async () => {
    const res = await ctx.client().post('/api/v1/auth/login/options');
    const body = (await res.json()) as { options: { allowCredentials?: unknown[]; userVerification?: string } };
    expect(body.options.allowCredentials ?? []).toEqual([]);
    expect(body.options.userVerification).toBe('required');
  });

  it('gives the same 401 for an unknown ID and for a passkey of another user', async () => {
    const alice = await createPasskeyUser(ctx, 'alice');
    await createPasskeyUser(ctx, 'bobby');
    const unknown = await login('nobody', alice.authenticator);
    const mismatch = await login('bobby', alice.authenticator);
    expect(unknown.res.status).toBe(401);
    expect(mismatch.res.status).toBe(401);
    expect(await unknown.res.json()).toEqual(await mismatch.res.json());
  });

  it('cannot reuse a challenge', async () => {
    const { authenticator } = await createPasskeyUser(ctx, 'alice');
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
    const { authenticator } = await createPasskeyUser(ctx, 'alice');
    for (let i = 0; i < 5; i += 1) await login('alice', authenticator, '198.51.100.9');
    expect((await login('alice', authenticator, '198.51.100.9')).res.status).toBe(429);
    expect((await login('alice', authenticator, '203.0.113.50')).res.status).toBe(204);
  });
});

describe('login with a password', () => {
  it('signs in at once on a trusted device and extends the trust', async () => {
    const { deviceToken } = await registered();
    const [before] = await ctx.deps.db.select().from(trustedDevices);
    const { client, res } = await loginWithPassword(ctx, 'alice', DEFAULT_PASSWORD, { deviceToken });
    expect(res.status).toBe(204);
    expect((await client.get('/api/v1/me')).status).toBe(200);
    const [after] = await ctx.deps.db.select().from(trustedDevices);
    expect(after?.expiresAt.getTime()).toBeGreaterThanOrEqual(before?.expiresAt.getTime() ?? Infinity);
    expect(ctx.outbox).toHaveLength(0);
  });

  it('asks a new device for a one-time password before signing in', async () => {
    await registered();
    const { client, res } = await loginWithPassword(ctx, 'alice');
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ next: 'verify-device' });
    const [row] = await ctx.deps.db.select().from(sessions).where(eqToken(client.cookies.get(SESSION_COOKIE)));
    expect(row?.scope).toBe('device_check');
    expect(ctx.outbox.at(-1)?.to).toBe('alice@example.com');
    expect(ctx.outbox.at(-1)?.subject).toBe('【diary-log】新しい端末からのログインの確認');
    expect((await client.get('/api/v1/me')).status).toBe(401);
  });

  it('signs in and trusts the device after the one-time password', async () => {
    await registered();
    const { client } = await loginWithPassword(ctx, 'alice');
    const pending = client.cookies.get(SESSION_COOKIE);
    const res = await client.post('/api/v1/auth/login/device/verify', { code: lastOtp(ctx.outbox, 'alice@example.com') });
    expect(res.status).toBe(204);
    expect((await client.get('/api/v1/me')).status).toBe(200);
    expect(client.cookies.get(SESSION_COOKIE)).not.toBe(pending);
    expect(await ctx.deps.db.select().from(sessions).where(eqToken(pending))).toHaveLength(0);
    expect(ctx.outbox.at(-1)?.subject).toBe('【diary-log】新しい端末からログインしました');
    const again = await loginWithPassword(ctx, 'alice', DEFAULT_PASSWORD, { deviceToken: client.cookies.get(DEVICE_COOKIE) });
    expect(again.res.status).toBe(204);
  });

  it('rejects a wrong one-time password and a call without the device check session', async () => {
    await registered();
    const { client } = await loginWithPassword(ctx, 'alice');
    const wrong = lastOtp(ctx.outbox) === '00000000' ? '11111111' : '00000000';
    expect((await client.post('/api/v1/auth/login/device/verify', { code: wrong })).status).toBe(401);
    expect((await client.get('/api/v1/me')).status).toBe(401);
    expect((await ctx.client().post('/api/v1/auth/login/device/verify', { code: wrong })).status).toBe(401);
  });

  it('resends the one-time password up to three times an hour', async () => {
    await registered();
    const { client } = await loginWithPassword(ctx, 'alice');
    for (let i = 0; i < 3; i += 1) expect((await client.post('/api/v1/auth/login/device/resend')).status).toBe(202);
    expect(ctx.outbox).toHaveLength(4);
    expect((await client.post('/api/v1/auth/login/device/resend')).status).toBe(429);
  });

  it('gives the same answer for an unknown ID, a passkey-only user, and a wrong password, after the same work', async () => {
    await registered();
    await createPasskeyUser(ctx, 'bobby');
    const derive = vi.spyOn(internals, 'derive');
    const results = [];
    for (const [handle, password] of [
      ['nobody', DEFAULT_PASSWORD],
      ['bobby', DEFAULT_PASSWORD],
      ['alice', 'wrong horse battery staple'],
    ] as const) {
      const { res } = await loginWithPassword(ctx, handle, password);
      results.push({ status: res.status, body: await res.json() });
    }
    expect(results[0]?.status).toBe(401);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(derive).toHaveBeenCalledTimes(3);
  });

  it('gives the same 401 for a password that is too short to be valid', async () => {
    await registered();
    const { res } = await loginWithPassword(ctx, 'alice', 'short');
    const { res: wrong } = await loginWithPassword(ctx, 'alice', 'wrong horse battery staple');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(await wrong.json());
  });

  it('limits attempts per IP and ID', async () => {
    await registered();
    for (let i = 0; i < 5; i += 1) await loginWithPassword(ctx, 'alice', 'wrong horse battery staple', { ip: '198.51.100.9' });
    expect((await loginWithPassword(ctx, 'alice', DEFAULT_PASSWORD, { ip: '198.51.100.9' })).res.status).toBe(429);
    expect((await loginWithPassword(ctx, 'alice', DEFAULT_PASSWORD, { ip: '203.0.113.50' })).res.status).toBe(202);
  });

  it('logs out and invalidates the session', async () => {
    const { client } = await registerUser(ctx, 'alice');
    const res = await client.post('/api/v1/auth/logout');
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().join()).toContain('Max-Age=0');
    expect((await client.get('/api/v1/me')).status).toBe(401);
  });
});

function eqToken(token: string | undefined) {
  if (!token) throw new Error('セッションの Cookie がありません');
  return sql`${sessions.tokenHash} = ${ctx.deps.secrets.hashToken(token)}`;
}
