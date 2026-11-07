// ブロック。同じトランザクションで両方向のフォローを削除する
import { and, asc, eq, or } from 'drizzle-orm';
import { handleSchema } from '@diary/shared';
import type { ApiApp, AppDeps } from '../app.ts';
import { requireAuth } from '../auth/middleware.ts';
import { summaryOf } from '../diaries/routes.ts';
import { blocks, follows, users } from '../platform/db/schema.ts';
import { errors } from '../platform/errors.ts';
import { findUserByHandle } from '../profile/account.ts';

export function blockRoutes(api: ApiApp, deps: AppDeps): void {
  const full = requireAuth('full');

  const target = async (handleParam: string) => {
    const handle = handleSchema.safeParse(handleParam);
    const user = handle.success ? await findUserByHandle(deps, handle.data) : undefined;
    if (!user) throw errors.notFound();
    return user;
  };

  api.get('/me/blocks', full, async (c) => {
    const rows = await deps.db
      .select({ user: users })
      .from(blocks)
      .innerJoin(users, eq(users.id, blocks.blockedId))
      .where(eq(blocks.blockerId, c.get('session').userId))
      .orderBy(asc(users.handle));
    return c.json(rows.map((r) => summaryOf(r.user)));
  });

  api.put('/me/blocks/:handle', full, async (c) => {
    const { userId } = c.get('session');
    const other = await target(c.req.param('handle'));
    if (other.id === userId) throw errors.conflict('cannot-block-self', '自分をブロックすることはできません');
    await deps.db.transaction(async (tx) => {
      await tx.insert(blocks).values({ blockerId: userId, blockedId: other.id }).onConflictDoNothing();
      await tx
        .delete(follows)
        .where(
          or(
            and(eq(follows.followerId, userId), eq(follows.followeeId, other.id)),
            and(eq(follows.followerId, other.id), eq(follows.followeeId, userId)),
          ),
        );
    });
    return c.body(null, 204);
  });

  api.delete('/me/blocks/:handle', full, async (c) => {
    const other = await target(c.req.param('handle'));
    await deps.db.delete(blocks).where(and(eq(blocks.blockerId, c.get('session').userId), eq(blocks.blockedId, other.id)));
    return c.body(null, 204);
  });
}
