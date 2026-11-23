// 004 FR-001 で登録をパスキーからパスワードに変えたため、パスキーでの登録を前提にしたテストを
// パスワードでの登録に書き換えた(ID とメールアドレスの確認の期待は変えない)
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_COOKIE } from '../../src/auth/trusted-device.ts';
import { SESSION_COOKIE } from '../../src/auth/session.ts';
import { users } from '../../src/platform/db/schema.ts';
import { buildTestContext, lastOtp, type TestClient } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { DEFAULT_PASSWORD, loginWithPassword, registerUser } from '../helpers/flows.ts';

const ctx = buildTestContext();
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
});
afterAll(closeDb);

async function verified(handle = 'alice', email = 'a@example.com'): Promise<{ client: TestClient; registrationId: string }> {
  const client = ctx.client();
  const start = await client.post('/api/v1/auth/registration/start', { handle, email });
  const { registrationId } = (await start.json()) as { registrationId: string };
  const res = await client.post('/api/v1/auth/registration/verify-email', { registrationId, code: lastOtp(ctx.outbox, email) });
  expect(res.status).toBe(204);
  return { client, registrationId };
}

const fieldCodes = async (res: Response) =>
  ((await res.json()) as { errors: { field: string; code: string }[] }).errors.map((e) => `${e.field}/${e.code}`);

describe('registration', () => {
  it('creates an account with ID, verified email, and password, then signs in', async () => {
    const { client } = await registerUser(ctx, 'alice');
    const me = await client.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ handle: 'alice', email: 'alice@example.com', visibility: 'private', hasPassword: true });
  });

  it('does not ask for a passkey after the email is verified', async () => {
    const client = ctx.client();
    const start = await client.post('/api/v1/auth/registration/start', { handle: 'alice', email: 'a@example.com' });
    const { registrationId } = (await start.json()) as { registrationId: string };
    const res = await client.post('/api/v1/auth/registration/verify-email', { registrationId, code: lastOtp(ctx.outbox) });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('stores only a scrypt hash, sets the session and the trusted device cookies', async () => {
    const { client, registrationId } = await verified();
    const res = await client.post('/api/v1/auth/registration/finish', { registrationId, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(201);
    expect(client.cookies.get(SESSION_COOKIE)).toBeTruthy();
    expect(client.cookies.get(DEVICE_COOKIE)).toBeTruthy();
    const [row] = await ctx.deps.db.select().from(users).where(eq(users.handle, 'alice'));
    expect(row?.passwordHash).toMatch(/^scrypt\$/);
    expect(row?.passwordHash).not.toContain(DEFAULT_PASSWORD);
    expect(row?.passwordChangedAt).toBeInstanceOf(Date);
  });

  it('rejects passwords that break the rules', async () => {
    const { client, registrationId } = await verified();
    const finish = (password: string) => client.post('/api/v1/auth/registration/finish', { registrationId, password });
    const short = await finish('a'.repeat(11));
    expect(short.status).toBe(422);
    expect(await fieldCodes(short)).toEqual(['password/too_small']);
    expect(await fieldCodes(await finish('PasswordPassword'))).toEqual(['password/common']);
    expect(await fieldCodes(await finish('my-alice-diary-2026'))).toEqual(['password/contains_handle']);
  });

  it('cannot finish without a verified email', async () => {
    const client = ctx.client();
    const start = await client.post('/api/v1/auth/registration/start', { handle: 'alice', email: 'a@example.com' });
    const { registrationId } = (await start.json()) as { registrationId: string };
    const res = await client.post('/api/v1/auth/registration/finish', { registrationId, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('lets the device used for sign-up log in with the password alone', async () => {
    const { client } = await registerUser(ctx, 'alice');
    await client.post('/api/v1/auth/logout');
    const { res } = await loginWithPassword(ctx, 'alice', DEFAULT_PASSWORD, { client });
    expect(res.status).toBe(204);
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

  it('can resend the code, and earlier codes stay valid (up to 3)', async () => {
    const client = ctx.client();
    const start = await client.post('/api/v1/auth/registration/start', { handle: 'alice', email: 'a@example.com' });
    const { registrationId } = (await start.json()) as { registrationId: string };
    const first = lastOtp(ctx.outbox);
    const resend = await client.post('/api/v1/auth/registration/resend', { registrationId });
    expect(resend.status).toBe(202);
    expect(ctx.outbox).toHaveLength(2);
    const res = await client.post('/api/v1/auth/registration/verify-email', { registrationId, code: first });
    expect(res.status).toBe(204);
  });

  it('re-checks the handle when finishing, so two pending registrations cannot both take it', async () => {
    const a = await verified('alice', 'a@example.com');
    const b = await verified('alice', 'b@example.com');
    const finish = (x: typeof a) =>
      x.client.post('/api/v1/auth/registration/finish', { registrationId: x.registrationId, password: DEFAULT_PASSWORD });
    expect((await finish(a)).status).toBe(201);
    const second = await finish(b);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ type: 'handle-taken' });
  });
});
