// 004: パスキーでの登録の経路を削除したため、パスワードの利用者(registerUser)と、既存のパスキーだけの利用者
// (createPasskeyUser)で書き直した。最後のパスキーの削除は、パスワードを持つ場合に限り許可する(FR-011)
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext, type TestClient } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createPasskeyUser, registerUser, stepUp, stepUpWithPassword } from '../helpers/flows.ts';
import { SoftwareAuthenticator } from '../helpers/software-authenticator.ts';

let clock = new Date('2026-11-07T00:00:00Z');
const ctx = buildTestContext({ now: () => clock });
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
  clock = new Date('2026-11-07T00:00:00Z');
});
afterAll(closeDb);

type Passkey = { id: string; name: string };

async function addPasskey(client: TestClient, name?: string) {
  const opts = (await (await client.post('/api/v1/me/passkeys/options')).json()) as {
    challengeId: string;
    options: { challenge: string; rp: { id?: string }; user: { id: string } };
  };
  return client.post('/api/v1/me/passkeys/finish', {
    challengeId: opts.challengeId,
    credential: new SoftwareAuthenticator().create(opts.options),
    ...(name ? { name } : {}),
  });
}

const listOf = async (client: TestClient) => (await (await client.get('/api/v1/me/passkeys')).json()) as Passkey[];

describe('step-up and passkeys', () => {
  it('requires a recent step-up before adding a passkey', async () => {
    const { client, authenticator } = await createPasskeyUser(ctx, 'alice');
    const denied = await client.post('/api/v1/me/passkeys/options');
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ type: 'step-up-required', title: '本人確認が必要です' });
    await stepUp(client, authenticator);
    expect((await client.post('/api/v1/me/passkeys/options')).status).toBe(200);
  });

  it('expires the step-up after 5 minutes', async () => {
    const { client } = await registerUser(ctx, 'alice');
    await stepUpWithPassword(client);
    clock = new Date(clock.getTime() + 5 * 60 * 1000 + 1000);
    expect((await client.post('/api/v1/me/passkeys/options')).status).toBe(403);
  });

  it('lets a password user add a passkey after a password step-up, and notifies by mail', async () => {
    const { client } = await registerUser(ctx, 'alice');
    ctx.outbox.length = 0;
    await stepUpWithPassword(client);
    expect((await addPasskey(client, 'タブレット')).status).toBe(201);
    expect((await listOf(client)).map((p) => p.name)).toEqual(['タブレット']);
    expect(ctx.outbox.at(-1)?.subject).toContain('パスキーが追加');
  });

  it('lets a user with a password delete the last passkey', async () => {
    const { client } = await registerUser(ctx, 'alice');
    await stepUpWithPassword(client);
    await addPasskey(client);
    const [only] = await listOf(client);
    expect((await client.delete(`/api/v1/me/passkeys/${only?.id ?? ''}`)).status).toBe(204);
    expect(await listOf(client)).toHaveLength(0);
  });

  it('never deletes the last passkey of a user without a password', async () => {
    const { client, authenticator } = await createPasskeyUser(ctx, 'alice');
    await stepUp(client, authenticator);
    const [only] = await listOf(client);
    const res = await client.delete(`/api/v1/me/passkeys/${only?.id ?? ''}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ type: 'last-passkey' });
  });

  it('removes a non-last passkey and returns 404 for passkeys of other users', async () => {
    const alice = await createPasskeyUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bobby');
    await stepUp(alice.client, alice.authenticator);
    await addPasskey(alice.client);
    const list = await listOf(alice.client);
    await stepUpWithPassword(bob.client);
    expect((await bob.client.delete(`/api/v1/me/passkeys/${list[0]?.id ?? ''}`)).status).toBe(404);
    expect((await alice.client.delete(`/api/v1/me/passkeys/${list[0]?.id ?? ''}`)).status).toBe(204);
  });
});
