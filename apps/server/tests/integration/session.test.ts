import { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { requireAuth, requireStepUp, sessionMiddleware, type AuthEnv } from '../../src/auth/middleware.ts';
import { createSessionStore, SESSION_COOKIE } from '../../src/auth/session.ts';
import { handleError } from '../../src/platform/errors.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createUser } from '../helpers/users.ts';

let clock = new Date('2026-11-07T00:00:00Z');
const ctx = buildTestContext({ now: () => clock });
const store = createSessionStore(ctx.deps);

const app = new Hono<AuthEnv>();
app.onError(handleError(ctx.deps.logger));
app.use('*', sessionMiddleware(ctx.deps));
app.get('/full', requireAuth('full'), (c) => c.json({ userId: c.get('session').userId }));
app.get('/recovery', requireAuth('recovery'), (c) => c.json({ ok: true }));
app.get('/sensitive', requireAuth('full'), requireStepUp(ctx.deps), (c) => c.json({ ok: true }));

const call = (path: string, token?: string) =>
  app.request(`https://localhost${path}`, token ? { headers: { cookie: `${SESSION_COOKIE}=${token}` } } : {});

beforeEach(async () => {
  await resetDb();
  clock = new Date('2026-11-07T00:00:00Z');
});
afterAll(closeDb);

describe('sessions', () => {
  it('authenticates a valid full session', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const { token } = await store.create(user.id, 'full');
    const res = await call('/full', token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: user.id });
  });

  it('returns 401 without a cookie or with an unknown token', async () => {
    expect((await call('/full')).status).toBe(401);
    expect((await call('/full', 'unknown')).status).toBe(401);
  });

  it('expires full sessions after 30 days', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const { token } = await store.create(user.id, 'full');
    clock = new Date(clock.getTime() + 30 * 24 * 3600 * 1000 + 1000);
    expect((await call('/full', token)).status).toBe(401);
  });

  it('expires recovery sessions after 10 minutes', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const { token } = await store.create(user.id, 'recovery');
    expect((await call('/recovery', token)).status).toBe(200);
    clock = new Date(clock.getTime() + 10 * 60 * 1000 + 1000);
    expect((await call('/recovery', token)).status).toBe(401);
  });

  it('does not let a recovery session access full routes', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const { token } = await store.create(user.id, 'recovery');
    expect((await call('/full', token)).status).toBe(401);
  });

  it('stops working after revocation', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const { token } = await store.create(user.id, 'full');
    await store.revoke(token);
    expect((await call('/full', token)).status).toBe(401);
  });

  it('can revoke every other session of a user', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const a = await store.create(user.id, 'full');
    const b = await store.create(user.id, 'full');
    await store.revokeAllForUser(user.id, a.token);
    expect((await call('/full', a.token)).status).toBe(200);
    expect((await call('/full', b.token)).status).toBe(401);
  });

  it('requires a recent step-up for sensitive routes', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const { token } = await store.create(user.id, 'full');
    const res = await call('/sensitive', token);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ type: 'step-up-required' });
    await store.markStepUp(token);
    expect((await call('/sensitive', token)).status).toBe(200);
    clock = new Date(clock.getTime() + 5 * 60 * 1000 + 1000);
    expect((await call('/sensitive', token)).status).toBe(403);
  });

  it('builds a hardened cookie', () => {
    const cookie = store.cookie('tok', 'full');
    expect(cookie).toMatch(/^__Host-session=tok;/);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).not.toContain('Domain');
  });
});
