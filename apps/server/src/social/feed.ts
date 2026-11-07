// フォロー中のユーザーの絵日記の一覧と、ユーザーごとの絵日記の一覧。
// 閲覧条件は viewableOwnerCondition を使い、ここで再定義しない(憲章の原則 VII)
import { and, desc, eq, ne, or, lt, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { diaryDateSchema, type DiaryPage } from '@diary/shared';
import type { ApiApp, AppDeps } from '../app.ts';
import { requireAuth } from '../auth/middleware.ts';
import { summaryOf } from '../diaries/routes.ts';
import { diaryListColumns, readContent, toDiary } from '../diaries/repository.ts';
import { diaries, users } from '../platform/db/schema.ts';
import { errors } from '../platform/errors.ts';
import { parse, uuidSchema } from '../platform/validation.ts';
import { resolveVisibleUser } from './users.ts';
import { canViewDiaries, viewableOwnerCondition } from './view-policy.ts';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});

type Cursor = { date: string; id: string };

const encodeCursor = (c: Cursor) => Buffer.from(`${c.date}|${c.id}`).toString('base64url');

function decodeCursor(raw: string): Cursor {
  const [date, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  const parsed = z.object({ date: diaryDateSchema, id: uuidSchema }).safeParse({ date, id });
  if (!parsed.success) throw errors.validation([{ field: 'cursor', code: 'invalid' }]);
  return parsed.data;
}

async function page(deps: AppDeps, where: SQL, query: z.infer<typeof querySchema>): Promise<DiaryPage> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const after = cursor
    ? or(lt(diaries.diaryDate, cursor.date), and(eq(diaries.diaryDate, cursor.date), lt(diaries.id, cursor.id)))
    : undefined;
  const rows = await deps.db
    .select({ diary: diaryListColumns, owner: users })
    .from(diaries)
    .innerJoin(users, eq(users.id, diaries.userId))
    .where(and(where, after))
    .orderBy(desc(diaries.diaryDate), desc(diaries.id))
    .limit(query.limit + 1);
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  return {
    items: items.map((r) => toDiary(r.diary, readContent(deps, r.diary), summaryOf(r.owner))),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ date: last.diary.diaryDate, id: last.diary.id }) : null,
  };
}

export function feedRoutes(api: ApiApp, deps: AppDeps): void {
  const full = requireAuth('full');

  api.get('/feed', full, async (c) => {
    const { userId } = c.get('session');
    const query = parse(querySchema, c.req.query());
    const where = and(viewableOwnerCondition(userId), ne(users.id, userId));
    if (!where) throw new Error('閲覧条件を組み立てられませんでした');
    return c.json(await page(deps, where, query));
  });

  api.get('/users/:handle/diaries', full, async (c) => {
    const { userId } = c.get('session');
    const query = parse(querySchema, c.req.query());
    const owner = await resolveVisibleUser(deps, userId, c.req.param('handle'));
    if (!(await canViewDiaries(deps.db, userId, owner.id))) throw errors.notFound();
    const where = and(eq(users.id, owner.id), viewableOwnerCondition(userId));
    if (!where) throw new Error('閲覧条件を組み立てられませんでした');
    return c.json(await page(deps, where, query));
  });
}
