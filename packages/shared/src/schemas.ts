// ブラウザとサーバーで共有する検証スキーマ(憲章の原則 VII: 検証ルールを1箇所に定義する)
import { z } from 'zod';

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

/** 利用者が1文字と認識する単位(書記素)で文字数を数える */
export function graphemeLength(value: string): number {
  return [...segmenter.segment(value)].length;
}

const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'api', 'app', 'auth', 'diary', 'feed', 'help', 'login', 'logout',
  'me', 'null', 'official', 'recovery', 'register', 'root', 'settings', 'signup', 'support',
  'system', 'undefined', 'users',
]);

export const handleSchema = z
  .string()
  .regex(/^[a-z0-9_]{3,20}$/)
  .refine((value) => !RESERVED_HANDLES.has(value), { message: 'reserved' });

// 制御文字(改行を含む)を許可しない
// eslint-disable-next-line no-control-regex -- 制御文字の検出が目的
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export const NICKNAME_MAX = 20;
export const nicknameSchema = z
  .string()
  .refine((v) => v.trim().length > 0, { message: 'empty' })
  .refine((v) => graphemeLength(v) <= NICKNAME_MAX, { message: 'too_long' })
  .refine((v) => !CONTROL.test(v), { message: 'control_character' });

export const BODY_MAX = 400;
export const bodySchema = z
  .string()
  .refine((v) => v.trim().length > 0, { message: 'empty' })
  .refine((v) => graphemeLength(v) <= BODY_MAX, { message: 'too_long' });

export const WEATHERS = ['sunny', 'cloudy', 'rainy', 'snowy'] as const;
export const weatherSchema = z.enum(WEATHERS);
export type Weather = z.infer<typeof weatherSchema>;

export const otpSchema = z.string().regex(/^\d{8}$/);

export const emailSchema = z.email().max(254);

export const visibilitySchema = z.enum(['private', 'public']);
export type Visibility = z.infer<typeof visibilitySchema>;

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const diaryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate, { message: 'invalid_date' });

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
