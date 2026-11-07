import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext, lastOtp } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { registerUser, stepUp } from '../helpers/flows.ts';

const ctx = buildTestContext();
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
});
afterAll(closeDb);

describe('email change', () => {
  it('requires a step-up', async () => {
    const { client } = await registerUser(ctx, 'alice');
    const res = await client.post('/api/v1/me/email-change/start', { email: 'new@example.com' });
    expect(res.status).toBe(403);
  });

  it('changes the email after confirming the new address, and notifies the old one', async () => {
    const { client, authenticator } = await registerUser(ctx, 'alice', 'old@example.com');
    await stepUp(client, authenticator);
    const start = await client.post('/api/v1/me/email-change/start', { email: 'new@example.com' });
    expect(start.status).toBe(202);
    expect(ctx.outbox.at(-1)?.to).toBe('new@example.com');
    const verify = await client.post('/api/v1/me/email-change/verify', { code: lastOtp(ctx.outbox, 'new@example.com') });
    expect(verify.status).toBe(204);
    expect(await (await client.get('/api/v1/me')).json()).toMatchObject({ email: 'new@example.com' });
    expect(ctx.outbox.at(-1)).toMatchObject({ to: 'old@example.com' });
    expect(ctx.outbox.at(-1)?.subject).toContain('メールアドレスが変更');
  });

  it('rejects a wrong code without changing the email', async () => {
    const { client, authenticator } = await registerUser(ctx, 'alice', 'old@example.com');
    await stepUp(client, authenticator);
    await client.post('/api/v1/me/email-change/start', { email: 'new@example.com' });
    const code = lastOtp(ctx.outbox, 'new@example.com');
    const res = await client.post('/api/v1/me/email-change/verify', { code: code === '00000000' ? '11111111' : '00000000' });
    expect(res.status).toBe(401);
    expect(await (await client.get('/api/v1/me')).json()).toMatchObject({ email: 'old@example.com' });
  });
});
