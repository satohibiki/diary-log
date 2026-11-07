import { vi } from 'vitest';

type Reply = { status: number; body?: unknown; contentType?: string };

/** fetch を差し替え、パスごとに応答を返す。呼び出しを記録する */
export function mockFetch(routes: Record<string, Reply | ((init: RequestInit | undefined) => Reply)>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const method = init?.method ?? 'GET';
    const route = routes[`${method} ${url}`] ?? routes[url];
    if (!route) return Promise.reject(new TypeError(`unexpected fetch ${method} ${url}`));
    const reply = typeof route === 'function' ? route(init) : route;
    const headers = new Headers();
    if (reply.body !== undefined) {
      headers.set('content-type', reply.contentType ?? (reply.status >= 400 ? 'application/problem+json' : 'application/json'));
    }
    return Promise.resolve(
      new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status, headers }),
    );
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

export const me = {
  handle: 'alice',
  nickname: 'ありす',
  email: 'alice@example.com',
  visibility: 'private',
  hasAvatar: false,
};
