import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { canViewDiaries, viewableOwnerCondition } from '../../src/social/view-policy.ts';
import { users } from '../../src/platform/db/schema.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { block, createUser, follow, type TestUser } from '../helpers/users.ts';

const ctx = buildTestContext();
const db = ctx.deps.db;

beforeEach(resetDb);
afterAll(closeDb);

async function viewableByQuery(viewer: TestUser): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users).where(viewableOwnerCondition(viewer.id));
  return rows.map((r) => r.id).sort();
}

describe('canViewDiaries', () => {
  it('lets owners view their own diaries even when private', async () => {
    const owner = await createUser(ctx, { handle: 'owner' });
    expect(await canViewDiaries(db, owner.id, owner.id)).toBe(true);
  });

  it('denies anonymous viewers', async () => {
    const owner = await createUser(ctx, { handle: 'owner', visibility: 'public' });
    expect(await canViewDiaries(db, null, owner.id)).toBe(false);
  });

  type Case = {
    name: string;
    visibility: 'private' | 'public';
    follow?: 'pending' | 'approved';
    block?: 'owner-blocks-viewer' | 'viewer-blocks-owner';
    expected: boolean;
  };
  const cases: Case[] = [
    { name: 'public + approved follower', visibility: 'public', follow: 'approved', expected: true },
    { name: 'public + not following', visibility: 'public', expected: false },
    { name: 'public + pending follow', visibility: 'public', follow: 'pending', expected: false },
    { name: 'private + approved follower', visibility: 'private', follow: 'approved', expected: false },
    { name: 'public + approved but owner blocked viewer', visibility: 'public', follow: 'approved', block: 'owner-blocks-viewer', expected: false },
    { name: 'public + approved but viewer blocked owner', visibility: 'public', follow: 'approved', block: 'viewer-blocks-owner', expected: false },
  ];

  it.each(cases)('$name → $expected (function and SQL agree)', async (c) => {
    const owner = await createUser(ctx, { handle: 'owner', visibility: c.visibility });
    const viewer = await createUser(ctx, { handle: 'viewer' });
    if (c.follow) await follow(ctx, viewer, owner, c.follow);
    if (c.block === 'owner-blocks-viewer') await block(ctx, owner, viewer);
    if (c.block === 'viewer-blocks-owner') await block(ctx, viewer, owner);
    expect(await canViewDiaries(db, viewer.id, owner.id)).toBe(c.expected);
    const visible = await viewableByQuery(viewer);
    expect(visible.includes(owner.id)).toBe(c.expected);
    expect(visible.includes(viewer.id)).toBe(true);
  });

  it('returns false for a missing owner', async () => {
    const viewer = await createUser(ctx, { handle: 'viewer' });
    expect(await canViewDiaries(db, viewer.id, '00000000-0000-4000-8000-000000000000')).toBe(false);
  });
});
