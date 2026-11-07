import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext, lastOtp, type TestClient } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { registerUser } from '../helpers/flows.ts';
import { SoftwareAuthenticator } from '../helpers/software-authenticator.ts';

let clock = new Date('2026-11-07T00:00:00Z');
const ctx = buildTestContext({ now: () => clock });
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
  clock = new Date('2026-11-07T00:00:00Z');
});
afterAll(closeDb);

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
type Options = { challengeId: string; options: { challenge: string; rp: { id?: string }; user: { id: string } } };

async function requestCode(client: TestClient, handle: string, ip = '203.0.113.1') {
  const res = await client.request('POST', '/api/v1/auth/recovery/start', { json: { handle }, headers: { 'x-test-ip': ip } });
  await flush();
  return res;
}

describe('recovery', () => {
  it('answers the same way whether or not the ID exists', async () => {
    await registerUser(ctx, 'alice');
    ctx.outbox.length = 0;
    const known = await requestCode(ctx.client(), 'alice');
    const unknown = await requestCode(ctx.client(), 'nobody');
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(await known.text()).toBe(await unknown.text());
    expect(ctx.outbox).toHaveLength(1);
    expect(ctx.outbox[0]?.to).toBe('alice@example.com');
  });

  it('restores access with a new passkey, revokes other sessions, and notifies', async () => {
    const alice = await registerUser(ctx, 'alice');
    ctx.outbox.length = 0;
    const client = ctx.client();
    await requestCode(client, 'alice');
    const verify = await client.post('/api/v1/auth/recovery/verify', { handle: 'alice', code: lastOtp(ctx.outbox) });
    expect(verify.status).toBe(200);
    // 復旧中のセッションでは絵日記やアカウントにアクセスできない
    expect((await client.get('/api/v1/me')).status).toBe(401);
    const { challengeId, options } = (await verify.json()) as Options;
    const finish = await client.post('/api/v1/auth/recovery/finish', {
      challengeId,
      credential: new SoftwareAuthenticator().create(options),
    });
    expect(finish.status).toBe(204);
    expect((await client.get('/api/v1/me')).status).toBe(200);
    expect((await alice.client.get('/api/v1/me')).status).toBe(401);
    expect(ctx.outbox.at(-1)?.subject).toContain('復旧');
  });

  it('rejects wrong, expired, and reused codes', async () => {
    await registerUser(ctx, 'alice');
    ctx.outbox.length = 0;
    const client = ctx.client();
    await requestCode(client, 'alice');
    const code = lastOtp(ctx.outbox);
    const wrong = code === '00000000' ? '11111111' : '00000000';
    expect((await client.post('/api/v1/auth/recovery/verify', { handle: 'alice', code: wrong })).status).toBe(401);
    expect((await client.post('/api/v1/auth/recovery/verify', { handle: 'alice', code })).status).toBe(200);
    expect((await ctx.client().post('/api/v1/auth/recovery/verify', { handle: 'alice', code })).status).toBe(401);

    await requestCode(client, 'alice');
    const later = lastOtp(ctx.outbox);
    clock = new Date(clock.getTime() + 10 * 60 * 1000 + 1000);
    expect((await client.post('/api/v1/auth/recovery/verify', { handle: 'alice', code: later })).status).toBe(401);
  });

  it('invalidates codes after 5 failed attempts', async () => {
    await registerUser(ctx, 'alice');
    ctx.outbox.length = 0;
    const client = ctx.client();
    await requestCode(client, 'alice');
    const code = lastOtp(ctx.outbox);
    const wrong = code === '00000000' ? '11111111' : '00000000';
    for (let i = 0; i < 5; i += 1) await client.post('/api/v1/auth/recovery/verify', { handle: 'alice', code: wrong });
    expect((await client.post('/api/v1/auth/recovery/verify', { handle: 'alice', code })).status).toBe(401);
  });

  it('keeps up to 3 codes valid, so a stranger cannot invalidate the owner’s code by resending', async () => {
    await registerUser(ctx, 'alice');
    ctx.outbox.length = 0;
    await requestCode(ctx.client(), 'alice');
    const ownersCode = lastOtp(ctx.outbox);
    await requestCode(ctx.client(), 'alice');
    await requestCode(ctx.client(), 'alice');
    expect((await ctx.client().post('/api/v1/auth/recovery/verify', { handle: 'alice', code: ownersCode })).status).toBe(200);
  });

  it('drops the oldest code when a fourth is issued', async () => {
    await registerUser(ctx, 'alice');
    ctx.outbox.length = 0;
    await requestCode(ctx.client(), 'alice');
    const oldest = lastOtp(ctx.outbox);
    for (let i = 0; i < 3; i += 1) {
      clock = new Date(clock.getTime() + 1000);
      await requestCode(ctx.client(), 'alice', `198.51.100.${i + 10}`);
    }
    expect((await ctx.client().post('/api/v1/auth/recovery/verify', { handle: 'alice', code: oldest })).status).toBe(401);
  });

  it('limits sending per IP and ID', async () => {
    await registerUser(ctx, 'alice');
    const client = ctx.client();
    for (let i = 0; i < 3; i += 1) expect((await requestCode(client, 'alice')).status).toBe(202);
    expect((await requestCode(client, 'alice')).status).toBe(429);
  });
});
