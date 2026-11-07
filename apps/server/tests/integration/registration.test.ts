import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext, lastOtp } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { registerUser } from '../helpers/flows.ts';
import { SoftwareAuthenticator } from '../helpers/software-authenticator.ts';

const ctx = buildTestContext();
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
});
afterAll(closeDb);

type Options = { challengeId: string; options: { challenge: string; rp: { id?: string }; user: { id: string }; authenticatorSelection?: Record<string, unknown> } };

describe('registration', () => {
  it('creates an account with ID, verified email, and passkey, then signs in', async () => {
    const { client } = await registerUser(ctx, 'alice');
    const me = await client.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ handle: 'alice', email: 'alice@example.com', visibility: 'private' });
  });

  it('requires discoverable credentials and user verification, and never asks for a password', async () => {
    const client = ctx.client();
    const start = await client.post('/api/v1/auth/registration/start', { handle: 'alice', email: 'a@example.com' });
    const { registrationId } = (await start.json()) as { registrationId: string };
    const res = await client.post('/api/v1/auth/registration/verify-email', { registrationId, code: lastOtp(ctx.outbox) });
    const body = (await res.json()) as Options;
    expect(body.options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
    expect(JSON.stringify(body).toLowerCase()).not.toContain('password');
  });

  it('rejects a handle that is already used with 409', async () => {
    await registerUser(ctx, 'alice');
    const res = await ctx.client().post('/api/v1/auth/registration/start', { handle: 'alice', email: 'x@example.com' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ type: 'handle-taken' });
  });

  it('rejects invalid input with field errors', async () => {
    const res = await ctx.client().post('/api/v1/auth/registration/start', { handle: 'A!', email: 'nope' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { errors: { field: string }[] };
    expect(body.errors.map((e) => e.field).sort()).toEqual(['email', 'handle']);
  });

  it('reports a mail failure instead of pretending the code was sent', async () => {
    const failing = buildTestContext({ failMail: true });
    const res = await failing.client().post('/api/v1/auth/registration/start', { handle: 'alice', email: 'a@example.com' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ type: 'mail-failed' });
  });

  it('rejects a wrong one-time password', async () => {
    const client = ctx.client();
    const start = await client.post('/api/v1/auth/registration/start', { handle: 'alice', email: 'a@example.com' });
    const { registrationId } = (await start.json()) as { registrationId: string };
    const wrong = lastOtp(ctx.outbox) === '00000000' ? '11111111' : '00000000';
    const res = await client.post('/api/v1/auth/registration/verify-email', { registrationId, code: wrong });
    expect(res.status).toBe(401);
  });

  it('cannot finish without a verified email (no valid challenge)', async () => {
    const authenticator = new SoftwareAuthenticator();
    const res = await ctx.client().post('/api/v1/auth/registration/finish', {
      challengeId: '00000000-0000-4000-8000-000000000000',
      credential: authenticator.create({ challenge: 'AAAA', rp: { id: 'localhost' }, user: { id: 'AAAA' } }),
    });
    expect(res.status).toBe(401);
  });

  it('can resend the code, and earlier codes stay valid (up to 3)', async () => {
    const client = ctx.client();
    const start = await client.post('/api/v1/auth/registration/start', { handle: 'alice', email: 'a@example.com' });
    const { registrationId } = (await start.json()) as { registrationId: string };
    const first = lastOtp(ctx.outbox);
    const resend = await client.post('/api/v1/auth/registration/resend', { registrationId });
    expect(resend.status).toBe(202);
    expect(ctx.outbox).toHaveLength(2);
    const res = await client.post('/api/v1/auth/registration/verify-email', { registrationId, code: first });
    expect(res.status).toBe(200);
  });

  it('re-checks the handle when finishing, so two pending registrations cannot both take it', async () => {
    const make = async (email: string) => {
      const client = ctx.client();
      const start = await client.post('/api/v1/auth/registration/start', { handle: 'alice', email });
      const { registrationId } = (await start.json()) as { registrationId: string };
      const verify = await client.post('/api/v1/auth/registration/verify-email', { registrationId, code: lastOtp(ctx.outbox, email) });
      return { client, body: (await verify.json()) as Options };
    };
    const a = await make('a@example.com');
    const b = await make('b@example.com');
    const finish = (x: typeof a) =>
      x.client.post('/api/v1/auth/registration/finish', {
        challengeId: x.body.challengeId,
        credential: new SoftwareAuthenticator().create(x.body.options),
      });
    expect((await finish(a)).status).toBe(201);
    const second = await finish(b);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ type: 'handle-taken' });
  });
});
