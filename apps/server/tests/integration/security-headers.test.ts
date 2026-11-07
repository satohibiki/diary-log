import { afterAll, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb } from '../helpers/db.ts';

const ctx = buildTestContext();
afterAll(closeDb);

const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

describe('security headers', () => {
  it.each(['/api/v1/does-not-exist', '/', '/calendar'])('are set on %s', async (path) => {
    const res = await ctx.client().get(path);
    expect(res.headers.get('content-security-policy')).toBe(CSP);
    expect(res.headers.get('strict-transport-security')).toBe('max-age=63072000; includeSubDomains');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});

describe('origin check', () => {
  it('rejects state-changing API requests without an Origin header', async () => {
    const res = await ctx.app.request('https://localhost/api/v1/auth/logout', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('rejects state-changing API requests from another origin', async () => {
    const res = await ctx.client().request('POST', '/api/v1/auth/logout', {
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects bodies that are not JSON or multipart', async () => {
    const res = await ctx.app.request('https://localhost/api/v1/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://localhost:5173', 'content-type': 'text/plain' },
      body: 'x',
    });
    expect(res.status).toBe(415);
  });
});
