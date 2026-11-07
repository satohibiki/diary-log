// 承認制のフォロー。申請、承認、拒否、取り消し、解除、一覧(data-model.md の状態遷移)
import { and, asc, eq } from 'drizzle-orm';
import type { FollowList, UserSummary } from '@diary/shared';
import type { ApiApp, AppDeps } from '../app.ts';
import { requireAuth } from '../auth/middleware.ts';
import { summaryOf } from '../diaries/routes.ts';
import { isUniqueViolation } from '../platform/db/errors.ts';
import { follows, users } from '../platform/db/schema.ts';
import { errors } from '../platform/errors.ts';
import { resolveVisibleUser } from './users.ts';

export function followRoutes(api: ApiApp, deps: AppDeps): void {
  const full = requireAuth('full');

  const list = async (where: 'follower' | 'followee', userId: string): Promise<FollowList> => {
    const otherSide = where === 'follower' ? follows.followeeId : follows.followerId;
    const mySide = where === 'follower' ? follows.followerId : follows.followeeId;
    const rows = await deps.db
      .select({ user: users, status: follows.status })
      .from(follows)
      .innerJoin(users, eq(users.id, otherSide))
      .where(eq(mySide, userId))
      .orderBy(asc(users.handle));
    const pick = (status: 'approved' | 'pending'): UserSummary[] =>
      rows.filter((r) => r.status === status).map((r) => summaryOf(r.user));
    return { approved: pick('approved'), pending: pick('pending') };
  };

  api.post('/users/:handle/follow', full, async (c) => {
    const { userId } = c.get('session');
    const target = await resolveVisibleUser(deps, userId, c.req.param('handle'));
    if (target.id === userId) throw errors.conflict('cannot-follow-self', '自分をフォローすることはできません');
    try {
      await deps.db.insert(follows).values({ followerId: userId, followeeId: target.id, status: 'pending' });
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.conflict('already-following', '既にフォロー中、または申請中です');
      throw error;
    }
    return c.body(null, 202);
  });

  api.delete('/users/:handle/follow', full, async (c) => {
    const { userId } = c.get('session');
    const target = await resolveVisibleUser(deps, userId, c.req.param('handle'));
    await deps.db.delete(follows).where(and(eq(follows.followerId, userId), eq(follows.followeeId, target.id)));
    return c.body(null, 204);
  });

  api.get('/me/following', full, async (c) => c.json(await list('follower', c.get('session').userId)));
  api.get('/me/followers', full, async (c) => c.json(await list('followee', c.get('session').userId)));

  api.post('/me/followers/:handle/approve', full, async (c) => {
    const { userId } = c.get('session');
    const requester = await resolveVisibleUser(deps, userId, c.req.param('handle'));
    const updated = await deps.db
      .update(follows)
      .set({ status: 'approved', approvedAt: deps.now() })
      .where(and(eq(follows.followerId, requester.id), eq(follows.followeeId, userId), eq(follows.status, 'pending')))
      .returning({ id: follows.followerId });
    if (updated.length === 0) throw errors.notFound();
    return c.body(null, 204);
  });

  // 申請の拒否と、承認済みのフォロワーの削除
  api.delete('/me/followers/:handle', full, async (c) => {
    const { userId } = c.get('session');
    const handle = c.req.param('handle');
    const [follower] = await deps.db.select({ id: users.id }).from(users).where(eq(users.handle, handle));
    if (follower) {
      await deps.db.delete(follows).where(and(eq(follows.followerId, follower.id), eq(follows.followeeId, userId)));
    }
    return c.body(null, 204);
  });
}
