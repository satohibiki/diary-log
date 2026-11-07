import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setUnauthorizedHandler } from '../src/lib/api-client.ts';
import { mockFetch } from './helpers.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(() => undefined);
});

describe('api client', () => {
  it('sends JSON with same-origin credentials and parses the response', async () => {
    const calls = mockFetch({ 'POST /api/v1/x': { status: 200, body: { ok: true } } });
    await expect(api('/x', { method: 'POST', json: { a: 1 } })).resolves.toEqual({ ok: true });
    expect(calls[0]?.init?.credentials).toBe('same-origin');
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe('application/json');
    expect(calls[0]?.init?.body).toBe('{"a":1}');
  });

  it('returns undefined for 204', async () => {
    mockFetch({ 'DELETE /api/v1/x': { status: 204 } });
    await expect(api('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws ApiError carrying the problem details', async () => {
    mockFetch({
      '/api/v1/x': { status: 422, body: { type: 'validation', title: '入力内容を確認してください', status: 422, errors: [{ field: 'body', code: 'too_big' }] } },
    });
    const error = await api('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, problem: { type: 'validation', errors: [{ field: 'body' }] } });
  });

  it('calls the unauthorized handler on 401 and still throws', async () => {
    mockFetch({ '/api/v1/me': { status: 401, body: { type: 'unauthorized', title: 'ログインが必要です', status: 401 } } });
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    await expect(api('/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('reports a network failure as an ApiError instead of hiding it', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const error = await api('/x').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, problem: { type: 'network' } });
    expect((error as ApiError).problem.title).toContain('接続');
  });

  it('treats a non-problem error body as a generic server error', async () => {
    mockFetch({ '/api/v1/x': { status: 502, body: 'bad gateway', contentType: 'text/plain' } });
    await expect(api('/x')).rejects.toMatchObject({ status: 502, problem: { type: 'server-error' } });
  });
});
