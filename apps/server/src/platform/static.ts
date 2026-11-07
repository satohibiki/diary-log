// ビルド済みの SPA を配信する。存在しないパスには index.html を返す
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { MiddlewareHandler } from 'hono';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function serveSpa(root: string): MiddlewareHandler {
  const base = normalize(root + sep);
  return async (c) => {
    const path = normalize(join(base, decodeURIComponent(c.req.path)));
    if (path.startsWith(base) && extname(path) !== '') {
      try {
        const body = await readFile(path);
        const immutable = c.req.path.startsWith('/assets/');
        return c.body(body, 200, {
          'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
          'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return c.body(await readFile(join(base, 'index.html')), 200, {
      'content-type': TYPES['.html'] ?? 'text/html',
      'cache-control': 'no-cache',
    });
  };
}
