// 絵日記の閲覧条件。SQL の述語として1箇所で定義し、単体の判定と一覧の取得の両方で使う(憲章の原則 VII)
import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../platform/db/client.ts';
import { blocks, follows, users } from '../platform/db/schema.ts';

/**
 * `users` の行(絵日記の所有者)を viewerId が閲覧できる条件。
 * 本人、または「公開」かつ「承認済みのフォロー」かつ「どちらの方向にもブロックがない」場合のみ。
 */
export function viewableOwnerCondition(viewerId: string): SQL {
  return sql`(
    ${users.id} = ${viewerId}
    or (
      ${users.visibility} = 'public'
      and exists (
        select 1 from ${follows}
        where ${follows.followerId} = ${viewerId}
          and ${follows.followeeId} = ${users.id}
          and ${follows.status} = 'approved'
      )
      and not exists (
        select 1 from ${blocks}
        where (${blocks.blockerId} = ${users.id} and ${blocks.blockedId} = ${viewerId})
           or (${blocks.blockerId} = ${viewerId} and ${blocks.blockedId} = ${users.id})
      )
    )
  )`;
}

export async function canViewDiaries(db: Db, viewerId: string | null, ownerId: string): Promise<boolean> {
  if (viewerId === null) return false;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, ownerId), viewableOwnerCondition(viewerId)));
  return rows.length === 1;
}

/**
 * プロフィール(ニックネームとプロフィール画像)を閲覧できるか。
 * ログイン中で、どちらの方向にもブロックがなければ閲覧できる(FR-030)。
 */
export async function canSeeProfile(db: Db, viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const rows = await db
    .select({ id: blocks.blockerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, ownerId), eq(blocks.blockedId, viewerId)),
        and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, ownerId)),
      ),
    );
  return rows.length === 0;
}
