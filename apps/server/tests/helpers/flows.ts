// API を通した利用者の登録など、複数のテストで使う手順
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createSessionStore, SESSION_COOKIE } from '../../src/auth/session.ts';
import { DEVICE_COOKIE } from '../../src/auth/trusted-device.ts';
import { sessions, users } from '../../src/platform/db/schema.ts';
import { lastOtp, type TestClient, type TestContext } from './app.ts';
import { SoftwareAuthenticator } from './software-authenticator.ts';
import { createUser, loginAs, type TestUser } from './users.ts';

type CreationOptions = { challengeId: string; options: { challenge: string; rp: { id?: string }; user: { id: string } } };

export const DEFAULT_PASSWORD = 'correct horse battery staple';

/** 004: ID、メールアドレス、パスワードで登録する。登録した端末は確認済みになる */
export async function registerUser(
  ctx: TestContext,
  handle: string,
  email = `${handle}@example.com`,
  password = DEFAULT_PASSWORD,
) {
  const client = ctx.client();
  const start = await client.post('/api/v1/auth/registration/start', { handle, email });
  expect(start.status).toBe(202);
  const { registrationId } = (await start.json()) as { registrationId: string };
  const verify = await client.post('/api/v1/auth/registration/verify-email', {
    registrationId,
    code: lastOtp(ctx.outbox, email),
  });
  expect(verify.status).toBe(204);
  const finish = await client.post('/api/v1/auth/registration/finish', { registrationId, password });
  expect(finish.status).toBe(201);
  const [row] = await ctx.deps.db.select({ id: users.id }).from(users).where(eq(users.handle, handle));
  if (!row) throw new Error('登録したユーザーが見つかりません');
  return { client, handle, email, password, userId: row.id };
}

/**
 * 既存のパスキーだけの利用者を作る(004 でパスキーでの登録の経路を削除したため。research.md §6)。
 * DB に直接ユーザーを作り、本人確認済みのセッションでパスキーを登録する
 */
export async function createPasskeyUser(ctx: TestContext, handle: string) {
  const user: TestUser = await createUser(ctx, { handle });
  const client = await loginAs(ctx, user);
  const token = client.cookies.get(SESSION_COOKIE);
  if (!token) throw new Error('セッションがありません');
  await createSessionStore(ctx.deps).markStepUp(token);
  const authenticator = new SoftwareAuthenticator();
  const res = await client.post('/api/v1/me/passkeys/options');
  expect(res.status).toBe(200);
  const { challengeId, options } = (await res.json()) as CreationOptions;
  const finish = await client.post('/api/v1/me/passkeys/finish', { challengeId, credential: authenticator.create(options) });
  expect(finish.status).toBe(201);
  // 準備のための本人確認を取り消し、通常のログイン直後と同じ状態にする
  await ctx.deps.db.update(sessions).set({ stepUpUntil: null }).where(eq(sessions.tokenHash, ctx.deps.secrets.hashToken(token)));
  ctx.outbox.length = 0;
  return { client, authenticator, user };
}

/** パスキーで再認証し、機密性の高い操作を5分間許可する */
export async function stepUp(client: TestClient, authenticator: SoftwareAuthenticator) {
  const res = await client.post('/api/v1/auth/step-up/options');
  expect(res.status).toBe(200);
  const { challengeId, options } = (await res.json()) as { challengeId: string; options: { challenge: string } };
  const verify = await client.post('/api/v1/auth/step-up/verify', {
    challengeId,
    credential: authenticator.get(options),
  });
  expect(verify.status).toBe(204);
}

/** 004: パスワードで再認証する */
export async function stepUpWithPassword(client: TestClient, password = DEFAULT_PASSWORD) {
  const res = await client.post('/api/v1/auth/step-up/password', { password });
  expect(res.status).toBe(204);
}

/** 004: パスワードでログインする。deviceToken を渡すと、その端末(確認済みの Cookie)からのログインになる */
export async function loginWithPassword(
  ctx: TestContext,
  handle: string,
  password = DEFAULT_PASSWORD,
  options: { ip?: string; deviceToken?: string; client?: TestClient } = {},
) {
  const client = options.client ?? ctx.client();
  if (options.deviceToken) client.cookies.set(DEVICE_COOKIE, options.deviceToken);
  const res = await client.request('POST', '/api/v1/auth/login/password', {
    headers: { 'x-test-ip': options.ip ?? '203.0.113.1' },
    json: { handle, password },
  });
  return { client, res, deviceToken: client.cookies.get(DEVICE_COOKIE) };
}
