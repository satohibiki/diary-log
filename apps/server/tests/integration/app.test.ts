import { afterAll, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb } from '../helpers/db.ts';

const ctx = buildTestContext();
afterAll(closeDb);

describe('app routing', () => {
  it('returns a problem+json 404 for unknown API paths', async () => {
    const res = await ctx.client().get('/api/v1/nothing-here');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(await res.json()).toMatchObject({ type: 'not-found', status: 404 });
  });

  it.each(['/', '/calendar', '/users/alice'])('serves the SPA index.html for %s', async (path) => {
    const res = await ctx.client().get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<title>diary</title>');
  });

  it('does not cache API responses', async () => {
    const res = await ctx.client().get('/api/v1/nothing-here');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
