import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext, lastOtp } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { DEFAULT_PASSWORD, registerUser, stepUpWithPassword } from '../helpers/flows.ts';

const ctx = buildTestContext();
beforeEach(async () => {
  await resetDb();
  ctx.outbox.length = 0;
});
afterAll(closeDb);

async function databaseText(): Promise<string> {
  const tables = ['users', 'pending_registrations', 'email_otps', 'sessions', 'passkeys'];
  const parts: string[] = [];
  for (const table of tables) {
    const result = await ctx.deps.db.execute(sql.raw(`select * from ${table}`));
    for (const row of result.rows) {
      for (const value of Object.values(row)) {
        parts.push(Buffer.isBuffer(value) ? value.toString('latin1') : String(value));
      }
    }
  }
  return parts.join('\n');
}

describe('email privacy', () => {
  // 004: パスワードで登録し、パスワードで本人確認をする(パスキーでの登録の経路を削除したため)。
  // パスワードも平文で保存されないことを確かめる(SC-005)
  it('never stores email addresses or passwords in plain text', async () => {
    const { client } = await registerUser(ctx, 'alice', 'secret-alice@example.com');
    // 登録途中のデータも確認する
    await ctx.client().post('/api/v1/auth/registration/start', { handle: 'bobby', email: 'secret-bob@example.com' });
    await stepUpWithPassword(client);
    await client.post('/api/v1/me/email-change/start', { email: 'secret-new@example.com' });
    const text = await databaseText();
    expect(text).not.toContain('secret-alice@example.com');
    expect(text).not.toContain('secret-bob@example.com');
    expect(text).not.toContain('secret-new@example.com');
    expect(text).not.toContain(lastOtp(ctx.outbox));
    expect(text).not.toContain(DEFAULT_PASSWORD);
  });

  it('shows each user only their own email', async () => {
    const alice = await registerUser(ctx, 'alice', 'alice-private@example.com');
    const bob = await registerUser(ctx, 'bobby', 'bob-private@example.com');
    expect(await (await alice.client.get('/api/v1/me')).text()).not.toContain('bob-private@example.com');
    expect(await (await bob.client.get('/api/v1/me')).text()).not.toContain('alice-private@example.com');
  });
});
