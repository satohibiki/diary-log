import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../src/platform/rate-limit.ts';
import { rateLimits } from '../../src/platform/db/schema.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';

const ctx = buildTestContext();
let clock = new Date('2026-11-07T00:00:00Z');
const now = () => clock;
const limiter = () => createRateLimiter({ db: ctx.deps.db, secrets: ctx.deps.secrets, now });

beforeEach(async () => {
  await resetDb();
  clock = new Date('2026-11-07T00:00:00Z');
});
afterAll(closeDb);

describe('rate limiter', () => {
  it('allows requests up to the limit and rejects the next one with 429', async () => {
    const rl = limiter();
    for (let i = 0; i < 3; i += 1) await rl.consume('login', '1.2.3.4', 3, 60);
    await expect(rl.consume('login', '1.2.3.4', 3, 60)).rejects.toMatchObject({ status: 429 });
  });

  it('counts keys separately', async () => {
    const rl = limiter();
    await rl.consume('login', 'a', 1, 60);
    await expect(rl.consume('login', 'b', 1, 60)).resolves.toBeUndefined();
  });

  it('starts a new window after the window passes', async () => {
    const rl = limiter();
    await rl.consume('login', 'a', 1, 60);
    clock = new Date(clock.getTime() + 61_000);
    await expect(rl.consume('login', 'a', 1, 60)).resolves.toBeUndefined();
  });

  it('keeps counts across limiter instances (restart)', async () => {
    await limiter().consume('login', 'a', 1, 60);
    await expect(limiter().consume('login', 'a', 1, 60)).rejects.toMatchObject({ status: 429 });
  });

  it('stores keys only as HMACs', async () => {
    await limiter().consume('login', '198.51.100.7', 5, 60);
    const rows = await ctx.deps.db.select().from(rateLimits);
    expect(JSON.stringify(rows)).not.toContain('198.51.100.7');
  });
});
