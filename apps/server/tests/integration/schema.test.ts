import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { diaries, follows, passkeys, trustedDevices, users } from '../../src/platform/db/schema.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createUser } from '../helpers/users.ts';

const ctx = buildTestContext();
const db = ctx.deps.db;

beforeEach(resetDb);
afterAll(closeDb);

const diaryRow = (userId: string, date: string) => ({
  userId,
  diaryDate: date,
  contentEnc: Buffer.from('c'),
  imageEnc: Buffer.from('i'),
  keyVersion: 1,
});

describe('database schema', () => {
  it('defaults visibility to private', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.visibility).toBe('private');
  });

  it('rejects duplicate handles', async () => {
    await createUser(ctx, { handle: 'alice' });
    await expect(createUser(ctx, { handle: 'alice' })).rejects.toThrow();
  });

  it('allows only one diary per user and date', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    await db.insert(diaries).values(diaryRow(user.id, '2026-11-01'));
    await expect(db.insert(diaries).values(diaryRow(user.id, '2026-11-01'))).rejects.toThrow();
  });

  it('forbids following yourself', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    await expect(
      db.insert(follows).values({ followerId: user.id, followeeId: user.id, status: 'pending' }),
    ).rejects.toThrow();
  });

  it('requires unique credential IDs', async () => {
    const a = await createUser(ctx, { handle: 'alice' });
    const b = await createUser(ctx, { handle: 'bobby' });
    const row = (userId: string) => ({
      id: randomUUID(),
      userId,
      credentialId: Buffer.from('same-id'),
      publicKey: Buffer.from('pk'),
      signCount: 0,
      transports: [],
      name: 'phone',
    });
    await db.insert(passkeys).values(row(a.id));
    await expect(db.insert(passkeys).values(row(b.id))).rejects.toThrow();
  });

  it('cascades user deletion to diaries, passkeys, and follows', async () => {
    const a = await createUser(ctx, { handle: 'alice' });
    const b = await createUser(ctx, { handle: 'bobby' });
    await db.insert(diaries).values(diaryRow(a.id, '2026-11-01'));
    await db.insert(follows).values({ followerId: b.id, followeeId: a.id, status: 'approved' });
    await db.delete(users).where(eq(users.id, a.id));
    expect(await db.select().from(diaries)).toHaveLength(0);
    expect(await db.select().from(follows)).toHaveLength(0);
  });

  // 004: パスワードと確認済みの端末(data-model.md)
  it('keeps existing users without a password and requires both password columns together', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.passwordHash).toBeNull();
    expect(row?.passwordChangedAt).toBeNull();
    await expect(db.update(users).set({ passwordHash: 'scrypt$x' }).where(eq(users.id, user.id))).rejects.toThrow();
    await db.update(users).set({ passwordHash: 'scrypt$x', passwordChangedAt: new Date() }).where(eq(users.id, user.id));
  });

  it('stores trusted devices per user and token and deletes them with the user', async () => {
    const a = await createUser(ctx, { handle: 'alice' });
    const device = { userId: a.id, tokenHash: Buffer.from('h'), lastUsedAt: new Date(), expiresAt: new Date() };
    await db.insert(trustedDevices).values(device);
    await expect(db.insert(trustedDevices).values(device)).rejects.toThrow();
    await db.delete(users).where(eq(users.id, a.id));
    expect(await db.select().from(trustedDevices)).toHaveLength(0);
  });

  it('has the new enum values', async () => {
    const scopes = await db.execute(sql`select unnest(enum_range(null::session_scope))::text as v`);
    expect(scopes.rows.map((r) => r.v)).toContain('device_check');
    const purposes = await db.execute(sql`select unnest(enum_range(null::otp_purpose))::text as v`);
    expect(purposes.rows.map((r) => r.v)).toContain('new_device');
  });
});
