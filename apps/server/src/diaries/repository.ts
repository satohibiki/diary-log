// 絵日記の保存と読み込み。本文と天気は1つの暗号文に、画像は別の暗号文にする
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Diary, UserSummary, Weather } from '@diary/shared';
import type { AppDeps } from '../app.ts';
import { aad } from '../platform/crypto.ts';
import { diaries } from '../platform/db/schema.ts';

type Deps = Pick<AppDeps, 'db' | 'cipher' | 'now'>;
export type DiaryRow = typeof diaries.$inferSelect;
export type DiaryContent = { body: string; weather: Weather };

/** 一覧で使う列。画像の暗号文は読み込まない */
export const diaryListColumns = {
  id: diaries.id,
  userId: diaries.userId,
  diaryDate: diaries.diaryDate,
  contentEnc: diaries.contentEnc,
  keyVersion: diaries.keyVersion,
  updatedAt: diaries.updatedAt,
};
export type DiaryListRow = Pick<DiaryRow, keyof typeof diaryListColumns>;

function seal(deps: Deps, id: string, content: DiaryContent, image: Buffer) {
  const contentSealed = deps.cipher.encrypt(Buffer.from(JSON.stringify(content)), aad('diary.content', id));
  const imageSealed = deps.cipher.encrypt(image, aad('diary.image', id));
  return { contentEnc: contentSealed.ciphertext, imageEnc: imageSealed.ciphertext, keyVersion: contentSealed.keyVersion };
}

export function readContent(deps: Pick<AppDeps, 'cipher'>, row: DiaryListRow): DiaryContent {
  return JSON.parse(
    deps.cipher.decrypt(row.contentEnc, row.keyVersion, aad('diary.content', row.id)).toString('utf8'),
  ) as DiaryContent;
}

export function readImage(deps: Pick<AppDeps, 'cipher'>, row: Pick<DiaryRow, 'id' | 'imageEnc' | 'keyVersion'>): Buffer {
  return deps.cipher.decrypt(row.imageEnc, row.keyVersion, aad('diary.image', row.id));
}

export async function insertDiary(deps: Deps, userId: string, date: string, content: DiaryContent, image: Buffer): Promise<DiaryRow> {
  const id = randomUUID();
  const [row] = await deps.db
    .insert(diaries)
    .values({ id, userId, diaryDate: date, ...seal(deps, id, content, image) })
    .returning();
  if (!row) throw new Error('絵日記を保存できませんでした');
  return row;
}

export async function findDiary(deps: Pick<AppDeps, 'db'>, userId: string, date: string): Promise<DiaryRow | undefined> {
  const [row] = await deps.db
    .select()
    .from(diaries)
    .where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, date)));
  return row;
}

/** 内容を更新する。画像を指定しない場合は既存の画像を使い、同じ鍵のバージョンで暗号化し直す */
export async function updateDiary(deps: Deps, row: DiaryRow, content: DiaryContent, image: Buffer | null): Promise<DiaryRow> {
  const sealed = seal(deps, row.id, content, image ?? readImage(deps, row));
  const [updated] = await deps.db
    .update(diaries)
    .set({ ...sealed, updatedAt: deps.now() })
    .where(eq(diaries.id, row.id))
    .returning();
  if (!updated) throw new Error('絵日記を更新できませんでした');
  return updated;
}

export async function deleteDiary(deps: Pick<AppDeps, 'db'>, row: DiaryRow): Promise<void> {
  await deps.db.delete(diaries).where(eq(diaries.id, row.id));
}

export function toDiary(row: DiaryListRow, content: DiaryContent, author: UserSummary): Diary {
  return {
    date: row.diaryDate,
    body: content.body,
    weather: content.weather,
    imageUrl: `/api/v1/users/${author.handle}/diaries/${row.diaryDate}/image?v=${row.updatedAt.getTime().toString()}`,
    author,
  };
}
