// セッションの読み込みと、認証・スコープ・再認証の要求
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Db } from '../platform/db/client.ts';
import { errors } from '../platform/errors.ts';
import type { Secrets } from '../platform/secrets.ts';
import { createSessionStore, SESSION_COOKIE, type Scope, type SessionInfo } from './session.ts';

export type AuthEnv = {
  Variables: {
    maybeSession: SessionInfo | null;
    session: SessionInfo;
  };
};

type Deps = { db: Db; secrets: Secrets; now: () => Date };

export function sessionMiddleware(deps: Deps): MiddlewareHandler<AuthEnv> {
  const store = createSessionStore(deps);
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    c.set('maybeSession', token ? await store.find(token) : null);
    await next();
  };
}

export function requireAuth(scope: Scope): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const session = c.get('maybeSession');
    if (session?.scope !== scope) throw errors.unauthorized();
    c.set('session', session);
    await next();
  };
}

export function requireStepUp(deps: { now: () => Date }): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const until = c.get('session').stepUpUntil;
    if (!until || until <= deps.now()) throw errors.stepUpRequired();
    await next();
  };
}
