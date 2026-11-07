import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { registerUser, stepUp } from '../helpers/flows.ts';
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

describe('step-up and passkeys', () => {
  it('requires a recent step-up before adding a passkey', async () => {
    const { client, authenticator } = await registerUser(ctx, 'alice');
    const denied = await client.post('/api/v1/me/passkeys/options');
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ type: 'step-up-required' });
    await stepUp(client, authenticator);
    expect((await client.post('/api/v1/me/passkeys/options')).status).toBe(200);
  });

  it('expires the step-up after 5 minutes', async () => {
    const { client, authenticator } = await registerUser(ctx, 'alice');
    await stepUp(client, authenticator);
    clock = new Date(clock.getTime() + 5 * 60 * 1000 + 1000);
    expect((await client.post('/api/v1/me/passkeys/options')).status).toBe(403);
  });

  it('adds a passkey, lists it, and notifies by mail', async () => {
    const { client, authenticator } = await registerUser(ctx, 'alice');
    ctx.outbox.length = 0;
    await stepUp(client, authenticator);
    const opts = (await (await client.post('/api/v1/me/passkeys/options')).json()) as {
      challengeId: string;
      options: { challenge: string; rp: { id?: string }; user: { id: string } };
    };
    const second = new SoftwareAuthenticator();
    const res = await client.post('/api/v1/me/passkeys/finish', {
      challengeId: opts.challengeId,
      credential: second.create(opts.options),
      name: 'タブレット',
    });
    expect(res.status).toBe(201);
    const list = (await (await client.get('/api/v1/me/passkeys')).json()) as Passkey[];
    expect(list.map((p) => p.name)).toContain('タブレット');
    expect(list).toHaveLength(2);
    expect(ctx.outbox.at(-1)?.subject).toContain('パスキーが追加');
  });

  it('deletes a passkey but never the last one', async () => {
    const { client, authenticator } = await registerUser(ctx, 'alice');
    await stepUp(client, authenticator);
    const [only] = (await (await client.get('/api/v1/me/passkeys')).json()) as Passkey[];
    const res = await client.delete(`/api/v1/me/passkeys/${only?.id ?? ''}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ type: 'last-passkey' });
  });

  it('removes a non-last passkey and returns 404 for passkeys of other users', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bobby');
    await stepUp(alice.client, alice.authenticator);
    const opts = (await (await alice.client.post('/api/v1/me/passkeys/options')).json()) as {
      challengeId: string;
      options: { challenge: string; rp: { id?: string }; user: { id: string } };
    };
    await alice.client.post('/api/v1/me/passkeys/finish', {
      challengeId: opts.challengeId,
      credential: new SoftwareAuthenticator().create(opts.options),
    });
    const list = (await (await alice.client.get('/api/v1/me/passkeys')).json()) as Passkey[];
    await stepUp(bob.client, bob.authenticator);
    expect((await bob.client.delete(`/api/v1/me/passkeys/${list[0]?.id ?? ''}`)).status).toBe(404);
    expect((await alice.client.delete(`/api/v1/me/passkeys/${list[0]?.id ?? ''}`)).status).toBe(204);
  });
});
