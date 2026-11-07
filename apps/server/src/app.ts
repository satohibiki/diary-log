// ミドルウェアとルートを組み立てる
import { Hono, type Context } from 'hono';
import { accountSecurityRoutes } from './auth/account-security.ts';
import { sessionMiddleware, type AuthEnv } from './auth/middleware.ts';
import { authRoutes } from './auth/routes.ts';
import { exportRoutes } from './diaries/export.ts';
import { diaryRoutes } from './diaries/routes.ts';
import { avatarRoutes } from './profile/avatar.ts';
import { blockRoutes } from './social/blocks.ts';
import { feedRoutes } from './social/feed.ts';
import { followRoutes } from './social/follows.ts';
import { userRoutes } from './social/users.ts';
import { profileRoutes } from './profile/routes.ts';
import type { Config } from './platform/config.ts';
import type { CipherBox } from './platform/crypto.ts';
import type { Db } from './platform/db/client.ts';
import { errors, handleError, problem } from './platform/errors.ts';
import type { Logger } from './platform/logger.ts';
import type { Mailer } from './platform/mail.ts';
import type { RateLimiter } from './platform/rate-limit.ts';
import type { Secrets } from './platform/secrets.ts';
import { apiGuard, securityHeaders } from './platform/security.ts';
import { serveSpa } from './platform/static.ts';

export type AppDeps = {
  config: Config;
  db: Db;
  cipher: CipherBox;
  secrets: Secrets;
  mailer: Mailer;
  logger: Logger;
  rateLimiter: RateLimiter;
  now: () => Date;
  clientIp: (c: Context) => string;
  staticRoot: string;
};

export type ApiApp = Hono<AuthEnv>;

export function createApp(deps: AppDeps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.onError(handleError(deps.logger));
  app.use('*', async (c, next) => {
    const started = performance.now();
    await next();
    deps.logger.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    });
  });
  app.use('*', securityHeaders);

  const api = new Hono<AuthEnv>();
  api.use('*', apiGuard(deps.config.appOrigin));
  api.use('*', sessionMiddleware(deps));
  for (const register of routeModules) register(api, deps);
  api.all('*', (c) => problem(c, errors.notFound()));

  app.route('/api/v1', api);
  app.all('/api/*', (c) => problem(c, errors.notFound()));
  app.get('*', serveSpa(deps.staticRoot));
  return app;
}

type RouteModule = (api: ApiApp, deps: AppDeps) => void;
const routeModules: RouteModule[] = [
  authRoutes,
  accountSecurityRoutes,
  profileRoutes,
  avatarRoutes,
  diaryRoutes,
  exportRoutes,
  userRoutes,
  followRoutes,
  blockRoutes,
  feedRoutes,
];
