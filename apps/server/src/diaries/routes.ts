// 絵日記のエンドポイントと画像の配信。閲覧はすべて canViewDiaries を経由する
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { bodyLimit } from 'hono/body-limit';
import { diaryDateSchema, handleSchema, monthSchema, type UserSummary } from '@diary/shared';
import type { ApiApp, AppDeps } from '../app.ts';
import { requireAuth } from '../auth/middleware.ts';
import { diaries } from '../platform/db/schema.ts';
import { errors, problem } from '../platform/errors.ts';
import { parse } from '../platform/validation.ts';
import { findUserByHandle, findUserById, type UserRow } from '../profile/account.ts';
import { canViewDiaries } from '../social/view-policy.ts';
import { findDiary, readContent, readImage, toDiary } from './repository.ts';
import { createDiaryFromForm, removeDiary, updateDiaryFromForm } from './service.ts';

export const summaryOf = (user: UserRow): UserSummary => ({
  handle: user.handle,
  nickname: user.nickname,
  hasAvatar: user.avatarEnc !== null,
});

/** 画像のアップロードを含む要求の上限。画像自体の上限(10MB)はその後に検証する */
export const uploadLimit = bodyLimit({
  maxSize: 11 * 1024 * 1024,
  onError: (c) => problem(c, errors.payloadTooLarge()),
});

export function diaryRoutes(api: ApiApp, deps: AppDeps): void {
  const full = requireAuth('full');

  /** 閲覧できる所有者と日付を解決する。権限がない場合も存在しない場合も同じ 404 */
  const viewable = async (viewerId: string, handleParam: string, dateParam: string) => {
    const handle = handleSchema.safeParse(handleParam);
    const date = diaryDateSchema.safeParse(dateParam);
    if (!handle.success || !date.success) throw errors.notFound();
    const owner = await findUserByHandle(deps, handle.data);
    if (!owner || !(await canViewDiaries(deps.db, viewerId, owner.id))) throw errors.notFound();
    const row = await findDiary(deps, owner.id, date.data);
    if (!row) throw errors.notFound();
    return { owner, row };
  };

  api.get('/me/diaries', full, async (c) => {
    const month = parse(monthSchema, c.req.query('month'));
    const [y, m] = month.split('-').map(Number);
    const first = `${month}-01`;
    const next = new Date(Date.UTC(y ?? 0, m ?? 1, 1)).toISOString().slice(0, 10);
    const rows = await deps.db
      .select({ date: diaries.diaryDate })
      .from(diaries)
      .where(and(eq(diaries.userId, c.get('session').userId), gte(diaries.diaryDate, first), lt(diaries.diaryDate, next)))
      .orderBy(asc(diaries.diaryDate));
    return c.json({ dates: rows.map((r) => r.date) });
  });

  api.post('/me/diaries', full, uploadLimit, async (c) => {
    const { userId } = c.get('session');
    const row = await createDiaryFromForm(deps, userId, await c.req.parseBody());
    const owner = await findUserById(deps, userId);
    return c.json(toDiary(row, readContent(deps, row), summaryOf(owner)), 201);
  });

  api.put('/me/diaries/:date', full, uploadLimit, async (c) => {
    const { userId } = c.get('session');
    const date = diaryDateSchema.safeParse(c.req.param('date'));
    if (!date.success) throw errors.notFound();
    const row = await updateDiaryFromForm(deps, userId, date.data, await c.req.parseBody());
    const owner = await findUserById(deps, userId);
    return c.json(toDiary(row, readContent(deps, row), summaryOf(owner)));
  });

  api.delete('/me/diaries/:date', full, async (c) => {
    const date = diaryDateSchema.safeParse(c.req.param('date'));
    if (!date.success) throw errors.notFound();
    await removeDiary(deps, c.get('session').userId, date.data);
    return c.body(null, 204);
  });

  api.get('/users/:handle/diaries/:date', full, async (c) => {
    const { owner, row } = await viewable(c.get('session').userId, c.req.param('handle'), c.req.param('date'));
    return c.json(toDiary(row, readContent(deps, row), summaryOf(owner)));
  });

  api.get('/users/:handle/diaries/:date/image', full, async (c) => {
    const { row } = await viewable(c.get('session').userId, c.req.param('handle'), c.req.param('date'));
    return c.body(new Uint8Array(readImage(deps, row)), 200, { 'content-type': 'image/webp' });
  });
}
