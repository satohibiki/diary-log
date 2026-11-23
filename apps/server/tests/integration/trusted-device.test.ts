// 確認済みの端末(004 FR-015、FR-015a、research.md §4、§5)
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deviceCookie, isTrusted, revokeAll, trust } from '../../src/auth/trusted-device.ts';
import { trustedDevices } from '../../src/platform/db/schema.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createUser } from '../helpers/users.ts';

let now = new Date('2026-11-22T00:00:00Z');
const ctx = buildTestContext({ now: () => now });
const DAY = 24 * 3600 * 1000;

beforeEach(async () => {
  await resetDb();
  now = new Date('2026-11-22T00:00:00Z');
});
afterAll(closeDb);

describe('trusted devices', () => {
  it('trusts a device for the user only, after confirmation', async () => {
    const alice = await createUser(ctx, { handle: 'alice' });
    const bobby = await createUser(ctx, { handle: 'bobby' });
    expect(await isTrusted(ctx.deps, alice.id, undefined)).toBe(false);
    const token = await trust(ctx.deps, alice.id, undefined);
    expect(await isTrusted(ctx.deps, alice.id, token)).toBe(true);
    expect(await isTrusted(ctx.deps, bobby.id, token)).toBe(false);
    expect(await isTrusted(ctx.deps, alice.id, 'other-token')).toBe(false);
  });

  it('stores only the hash of the token', async () => {
    const alice = await createUser(ctx, { handle: 'alice' });
    const token = await trust(ctx.deps, alice.id, undefined);
    const [row] = await ctx.deps.db.select().from(trustedDevices);
    expect(row?.tokenHash.equals(Buffer.from(token))).toBe(false);
    expect(row?.tokenHash.equals(ctx.deps.secrets.hashToken(token))).toBe(true);
  });

  it('expires 90 days after the last use and extends on each use', async () => {
    const alice = await createUser(ctx, { handle: 'alice' });
    const token = await trust(ctx.deps, alice.id, undefined);
    now = new Date(now.getTime() + 60 * DAY);
    expect(await trust(ctx.deps, alice.id, token)).toBe(token);
    now = new Date(now.getTime() + 90 * DAY - 1000);
    expect(await isTrusted(ctx.deps, alice.id, token)).toBe(true);
    now = new Date(now.getTime() + 2000);
    expect(await isTrusted(ctx.deps, alice.id, token)).toBe(false);
  });

  it('lets one browser be trusted for two users, and revokes all devices of a user', async () => {
    const alice = await createUser(ctx, { handle: 'alice' });
    const bobby = await createUser(ctx, { handle: 'bobby' });
    const token = await trust(ctx.deps, alice.id, undefined);
    await trust(ctx.deps, bobby.id, token);
    const other = await trust(ctx.deps, alice.id, undefined);
    await revokeAll(ctx.deps, alice.id);
    expect(await isTrusted(ctx.deps, alice.id, token)).toBe(false);
    expect(await isTrusted(ctx.deps, alice.id, other)).toBe(false);
    expect(await isTrusted(ctx.deps, bobby.id, token)).toBe(true);
  });

  it('builds a host-only, HTTP-only, strict cookie for 90 days', () => {
    expect(deviceCookie('abc')).toBe('__Host-device=abc; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7776000');
  });
});
