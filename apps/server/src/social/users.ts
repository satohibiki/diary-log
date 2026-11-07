// ID の完全一致によるユーザーの検索と、閲覧してよい相手の解決
import { handleSchema } from '@diary/shared';
import type { ApiApp, AppDeps } from '../app.ts';
import { requireAuth } from '../auth/middleware.ts';
import { summaryOf } from '../diaries/routes.ts';
import { errors } from '../platform/errors.ts';
import { findUserByHandle, type UserRow } from '../profile/account.ts';
import { canSeeProfile } from './view-policy.ts';

/** 相手を ID で解決する。存在しない場合もブロックがある場合も同じ 404 */
export async function resolveVisibleUser(deps: AppDeps, viewerId: string, handleParam: string): Promise<UserRow> {
  const handle = handleSchema.safeParse(handleParam);
  if (!handle.success) throw errors.notFound();
  const user = await findUserByHandle(deps, handle.data);
  if (!user || !(await canSeeProfile(deps.db, viewerId, user.id))) throw errors.notFound();
  return user;
}

export function userRoutes(api: ApiApp, deps: AppDeps): void {
  api.get('/users/:handle', requireAuth('full'), async (c) => {
    const { userId } = c.get('session');
    await deps.rateLimiter.consume('user-search', userId, 30, 60);
    return c.json(summaryOf(await resolveVisibleUser(deps, userId, c.req.param('handle'))));
  });
}
