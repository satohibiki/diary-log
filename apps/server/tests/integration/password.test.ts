// 004: パスワードの変更と設定(FR-007、FR-008、FR-010、FR-015a、research.md §8)
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { trustedDevices } from '../../src/platform/db/schema.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createPasskeyUser, DEFAULT_PASSWORD, loginWithPassword, registerUser, stepUp } from '../helpers/flows.ts';

const ctx = buildTestContext({ now: () => new Date('2026-11-07T00:00:10Z') });
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
});
afterAll(closeDb);

const NEW_PASSWORD = 'a brand new passphrase 2026';

describe('PUT /me/password with a current password', () => {
  it('changes the password, signs other devices out, revokes device trust, and notifies', async () => {
    const alice = await registerUser(ctx, 'alice');
    const other = await loginWithPassword(ctx, 'alice', DEFAULT_PASSWORD, { deviceToken: alice.client.cookies.get('__Host-device') });
    expect(other.res.status).toBe(204);
    ctx.outbox.length = 0;

    const res = await alice.client.put('/api/v1/me/password', { currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(204);
    expect((await alice.client.get('/api/v1/me')).status).toBe(200);
    expect((await other.client.get('/api/v1/me')).status).toBe(401);
    expect(await ctx.deps.db.select().from(trustedDevices)).toHaveLength(0);
    expect(ctx.outbox.at(-1)?.subject).toBe('【diary-log】パスワードが変更されました');

    expect((await loginWithPassword(ctx, 'alice', DEFAULT_PASSWORD, { ip: '198.51.100.2' })).res.status).toBe(401);
    expect((await loginWithPassword(ctx, 'alice', NEW_PASSWORD, { ip: '198.51.100.3' })).res.status).toBe(202);
  });

  it('rejects a wrong current password and limits attempts', async () => {
    const { client } = await registerUser(ctx, 'alice');
    const wrong = { currentPassword: 'wrong horse battery staple', newPassword: NEW_PASSWORD };
    expect((await client.put('/api/v1/me/password', wrong)).status).toBe(401);
    for (let i = 0; i < 4; i += 1) await client.put('/api/v1/me/password', wrong);
    expect((await client.put('/api/v1/me/password', { currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(
      429,
    );
  });

  it('rejects a new password that breaks the rules', async () => {
    const { client } = await registerUser(ctx, 'alice');
    const res = await client.put('/api/v1/me/password', { currentPassword: DEFAULT_PASSWORD, newPassword: 'PasswordPassword' });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ errors: [{ field: 'password', code: 'common' }] });
  });

  it('requires a signed-in session', async () => {
    expect((await ctx.client().put('/api/v1/me/password', { newPassword: NEW_PASSWORD })).status).toBe(401);
  });
});

describe('PUT /me/password without a password yet', () => {
  it('requires a passkey step-up', async () => {
    const { client } = await createPasskeyUser(ctx, 'alice');
    const res = await client.put('/api/v1/me/password', { newPassword: NEW_PASSWORD });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ type: 'step-up-required' });
  });

  it('sets the password after a passkey step-up, notifies, and allows a password login', async () => {
    const { client, authenticator } = await createPasskeyUser(ctx, 'alice');
    await stepUp(client, authenticator);
    expect((await client.put('/api/v1/me/password', { newPassword: NEW_PASSWORD })).status).toBe(204);
    expect(ctx.outbox.at(-1)?.subject).toBe('【diary-log】パスワードが設定されました');
    expect(await (await client.get('/api/v1/me')).json()).toMatchObject({ hasPassword: true });
    expect((await loginWithPassword(ctx, 'alice', NEW_PASSWORD)).res.status).toBe(202);
  });
});
