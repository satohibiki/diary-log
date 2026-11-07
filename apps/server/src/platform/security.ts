// セキュリティヘッダー、Origin の検証、受け付ける Content-Type の制限
import type { MiddlewareHandler } from 'hono';
import { AppError, errors } from './errors.ts';

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('Content-Security-Policy', CSP);
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** API への状態変更の要求は、同じ配信元からの JSON または multipart のみ受け付ける */
export function apiGuard(appOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      if (c.req.header('origin') !== appOrigin) throw errors.forbidden();
      const type = c.req.header('content-type');
      if (type !== undefined && !/^(application\/json|multipart\/form-data)\b/i.test(type)) {
        throw new AppError(415, 'unsupported-media-type', '対応していない形式です');
      }
    }
    await next();
    c.header('Cache-Control', 'no-store');
  };
}
