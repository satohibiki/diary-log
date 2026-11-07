// API を通した利用者の登録など、複数のテストで使う手順
import { expect } from 'vitest';
import { lastOtp, type TestClient, type TestContext } from './app.ts';
import { SoftwareAuthenticator } from './software-authenticator.ts';

type Options = { challengeId: string; options: { challenge: string; rp: { id?: string }; user: { id: string } } };

export async function registerUser(ctx: TestContext, handle: string, email = `${handle}@example.com`) {
  const client = ctx.client();
  const authenticator = new SoftwareAuthenticator();
  const start = await client.post('/api/v1/auth/registration/start', { handle, email });
  expect(start.status).toBe(202);
  const { registrationId } = (await start.json()) as { registrationId: string };
  const verify = await client.post('/api/v1/auth/registration/verify-email', {
    registrationId,
    code: lastOtp(ctx.outbox, email),
  });
  expect(verify.status).toBe(200);
  const { challengeId, options } = (await verify.json()) as Options;
  const finish = await client.post('/api/v1/auth/registration/finish', {
    challengeId,
    credential: authenticator.create(options),
  });
  expect(finish.status).toBe(201);
  return { client, authenticator, handle, email, userId: options.user.id };
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
