import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteExpired } from '../../src/platform/cleanup.ts';
import {
  emailOtps,
  pendingRegistrations,
  rateLimits,
  sessions,
  webauthnChallenges,
} from '../../src/platform/db/schema.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createUser } from '../helpers/users.ts';

const ctx = buildTestContext();
const db = ctx.deps.db;
const now = new Date('2026-11-07T12:00:00Z');
const past = new Date(now.getTime() - 1000);
const future = new Date(now.getTime() + 60_000);

beforeEach(resetDb);
afterAll(closeDb);

describe('deleteExpired', () => {
  it('removes expired rows and keeps valid ones', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    await db.insert(sessions).values([
      { tokenHash: Buffer.from('a'), userId: user.id, scope: 'full', expiresAt: past },
      { tokenHash: Buffer.from('b'), userId: user.id, scope: 'full', expiresAt: future },
    ]);
    await db.insert(webauthnChallenges).values([
      { id: randomUUID(), challenge: 'x', purpose: 'login', expiresAt: past },
      { id: randomUUID(), challenge: 'y', purpose: 'login', expiresAt: future },
    ]);
    const pendingId = randomUUID();
    await db.insert(pendingRegistrations).values([
      { id: pendingId, handle: 'old', emailEnc: Buffer.from('e'), keyVersion: 1, expiresAt: past },
      { id: randomUUID(), handle: 'new', emailEnc: Buffer.from('e'), keyVersion: 1, expiresAt: future },
    ]);
    await db.insert(emailOtps).values([
      { id: randomUUID(), purpose: 'recovery', subjectId: user.id, codeHmac: Buffer.from('1'), expiresAt: past },
      { id: randomUUID(), purpose: 'recovery', subjectId: user.id, codeHmac: Buffer.from('2'), expiresAt: future },
      { id: randomUUID(), purpose: 'recovery', subjectId: user.id, codeHmac: Buffer.from('3'), expiresAt: future, consumedAt: past },
    ]);
    await db.insert(rateLimits).values([
      { bucket: 'b', windowStart: new Date(now.getTime() - 2 * 24 * 3600 * 1000), count: 1 },
      { bucket: 'b', windowStart: now, count: 1 },
    ]);

    await deleteExpired(db, now);

    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await db.select().from(webauthnChallenges)).toHaveLength(1);
    expect(await db.select().from(pendingRegistrations)).toHaveLength(1);
    expect(await db.select().from(emailOtps)).toHaveLength(1);
    expect(await db.select().from(rateLimits)).toHaveLength(1);
  });
});
