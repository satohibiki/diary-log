import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext, lastOtp } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createDiary } from '../helpers/diaries.ts';
import { registerUser, stepUp } from '../helpers/flows.ts';

const ctx = buildTestContext({ now: () => new Date('2027-01-01T00:00:00Z') });
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
  ctx.logs.length = 0;
});
afterAll(closeDb);

describe('log safety', () => {
  it('never writes diary content, email addresses, or one-time passwords to logs', async () => {
    const { client, authenticator } = await registerUser(ctx, 'alice', 'log-secret@example.com');
    const otps = [lastOtp(ctx.outbox)];
    await createDiary(client, '2026-12-24', 'ログに でては いけない ひみつの ぶんしょう');
    await client.get('/api/v1/users/alice/diaries/2026-12-24');
    await stepUp(client, authenticator);
    await client.post('/api/v1/me/email-change/start', { email: 'log-new@example.com' });
    otps.push(lastOtp(ctx.outbox));
    // 失敗する要求もログに残る
    await client.post('/api/v1/me/email-change/verify', { code: '00000000' });
    await ctx.client().post('/api/v1/auth/recovery/start', { handle: 'alice' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    otps.push(lastOtp(ctx.outbox));

    const logs = ctx.logs.join('\n');
    expect(ctx.logs.length).toBeGreaterThan(5);
    for (const secret of ['ひみつの ぶんしょう', 'log-secret@example.com', 'log-new@example.com', ...otps]) {
      expect(logs).not.toContain(secret);
    }
    expect(logs).not.toContain('month=');
  });
});
