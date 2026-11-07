// 絵日記の作成、編集、削除の規則
import { z } from 'zod';
import { bodySchema, diaryDateSchema, weatherSchema } from '@diary/shared';
import type { AppDeps } from '../app.ts';
import { isUniqueViolation } from '../platform/db/errors.ts';
import { errors, type FieldError } from '../platform/errors.ts';
import { processImage } from '../platform/images.ts';
import { toFieldErrors } from '../platform/validation.ts';
import { deleteDiary, findDiary, insertDiary, updateDiary, type DiaryRow } from './repository.ts';

/** 世界で最も早い時刻帯(UTC+14)の今日。これより後の日付は未来とみなす(FR-012) */
export function latestAllowedDate(now: Date): string {
  return new Date(now.getTime() + 14 * 3600 * 1000).toISOString().slice(0, 10);
}

type Form = Record<string, string | File | (string | File)[]>;

const textField = (form: Form, name: string) => {
  const value = form[name];
  return typeof value === 'string' ? value : undefined;
};

const contentSchema = z.object({ body: bodySchema, weather: weatherSchema });

async function readImageField(form: Form, required: boolean, fieldErrors: FieldError[]): Promise<Buffer | null> {
  const value = form.image;
  if (value instanceof File && value.size > 0) return Buffer.from(await value.arrayBuffer());
  if (required) fieldErrors.push({ field: 'image', code: 'required' });
  return null;
}

function validateContent(form: Form, fieldErrors: FieldError[]) {
  const result = contentSchema.safeParse({ body: textField(form, 'body'), weather: textField(form, 'weather') });
  if (!result.success) fieldErrors.push(...toFieldErrors(result.error));
  return result.data;
}

export async function createDiaryFromForm(deps: AppDeps, userId: string, form: Form): Promise<DiaryRow> {
  const fieldErrors: FieldError[] = [];
  const date = diaryDateSchema.safeParse(textField(form, 'date'));
  if (!date.success) fieldErrors.push({ field: 'date', code: 'invalid' });
  else if (date.data > latestAllowedDate(deps.now())) fieldErrors.push({ field: 'date', code: 'future' });
  const content = validateContent(form, fieldErrors);
  const raw = await readImageField(form, true, fieldErrors);
  if (fieldErrors.length > 0 || !content || !raw || !date.success) throw errors.validation(fieldErrors);

  const image = await processImage(raw, 'diary');
  try {
    return await insertDiary(deps, userId, date.data, content, image);
  } catch (error) {
    if (isUniqueViolation(error)) throw errors.conflict('diary-exists', 'その日付の絵日記は既にあります');
    throw error;
  }
}

export async function updateDiaryFromForm(deps: AppDeps, userId: string, date: string, form: Form): Promise<DiaryRow> {
  const row = await findDiary(deps, userId, date);
  if (!row) throw errors.notFound();
  const fieldErrors: FieldError[] = [];
  const content = validateContent(form, fieldErrors);
  const raw = await readImageField(form, false, fieldErrors);
  if (fieldErrors.length > 0 || !content) throw errors.validation(fieldErrors);
  return updateDiary(deps, row, content, raw ? await processImage(raw, 'diary') : null);
}

export async function removeDiary(deps: AppDeps, userId: string, date: string): Promise<void> {
  const row = await findDiary(deps, userId, date);
  if (!row) throw errors.notFound();
  await deleteDiary(deps, row);
}
