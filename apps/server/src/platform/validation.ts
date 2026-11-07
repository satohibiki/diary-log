// 要求の検証。Zod のエラーを項目ごとのエラーに変換する
import type { Context } from 'hono';
import { z } from 'zod';
import { AppError, errors } from './errors.ts';

export function toFieldErrors(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(body)',
    code: issue.code === 'custom' ? issue.message : issue.code,
  }));
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw errors.validation(toFieldErrors(result.error));
  return result.data;
}

export async function parseJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, 'invalid-json', 'JSON の形式が不正です');
  }
  return parse(schema, body);
}

/** WebAuthn の応答。詳細な検証は SimpleWebAuthn が行う */
export const credentialSchema = z.looseObject({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal('public-key'),
  response: z.looseObject({ clientDataJSON: z.string().max(65536) }),
});

export const uuidSchema = z.uuid();
