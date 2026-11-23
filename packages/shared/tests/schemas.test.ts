import { describe, expect, it } from 'vitest';
import {
  bodySchema,
  diaryDateSchema,
  emailSchema,
  graphemeLength,
  handleSchema,
  monthSchema,
  nicknameSchema,
  otpSchema,
  passwordSchema,
  visibilitySchema,
  weatherSchema,
} from '../src/index.ts';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('handleSchema', () => {
  it.each(['abc', 'a_b_c', 'user123', 'a'.repeat(20)])('accepts %s', (v) => {
    expect(ok(handleSchema, v)).toBe(true);
  });
  it.each(['ab', 'a'.repeat(21), 'ABC', 'a-b', 'あいう', 'a b', ''])('rejects %s', (v) => {
    expect(ok(handleSchema, v)).toBe(false);
  });
  it.each(['admin', 'api', 'me', 'root', 'support'])('rejects reserved word %s', (v) => {
    expect(ok(handleSchema, v)).toBe(false);
  });
});

describe('graphemeLength', () => {
  it('counts user-perceived characters', () => {
    expect(graphemeLength('👨‍👩‍👧‍👦が')).toBe(2);
    expect(graphemeLength('ｶﾞ')).toBe(1);
    expect(graphemeLength('ab')).toBe(2);
    expect(graphemeLength('が')).toBe(1);
  });
});

describe('nicknameSchema', () => {
  it('accepts 1 to 20 graphemes', () => {
    expect(ok(nicknameSchema, 'ひ')).toBe(true);
    expect(ok(nicknameSchema, '👨‍👩‍👧‍👦'.repeat(20))).toBe(true);
  });
  it('rejects empty, whitespace only, too long, and control characters', () => {
    expect(ok(nicknameSchema, '')).toBe(false);
    expect(ok(nicknameSchema, '   ')).toBe(false);
    expect(ok(nicknameSchema, 'あ'.repeat(21))).toBe(false);
    expect(ok(nicknameSchema, 'a\u0000b')).toBe(false);
  });
});

describe('bodySchema', () => {
  it('accepts 1 to 400 graphemes including newlines', () => {
    expect(ok(bodySchema, 'き')).toBe(true);
    expect(ok(bodySchema, 'あ'.repeat(399) + '\n')).toBe(true);
  });
  it('rejects empty, whitespace only, and more than 400 graphemes', () => {
    expect(ok(bodySchema, '')).toBe(false);
    expect(ok(bodySchema, ' \n ')).toBe(false);
    expect(ok(bodySchema, 'あ'.repeat(401))).toBe(false);
  });
});

describe('weatherSchema', () => {
  it.each(['sunny', 'cloudy', 'rainy', 'snowy'])('accepts %s', (v) => {
    expect(ok(weatherSchema, v)).toBe(true);
  });
  it('rejects other values', () => {
    expect(ok(weatherSchema, 'stormy')).toBe(false);
  });
});

describe('otpSchema', () => {
  it('accepts exactly 8 digits', () => {
    expect(ok(otpSchema, '01234567')).toBe(true);
  });
  it.each(['1234567', '123456789', 'abcdefgh', '1234 567'])('rejects %s', (v) => {
    expect(ok(otpSchema, v)).toBe(false);
  });
});

describe('emailSchema', () => {
  it('accepts a normal address', () => {
    expect(ok(emailSchema, 'user@example.com')).toBe(true);
  });
  it('rejects invalid and too long addresses', () => {
    expect(ok(emailSchema, 'not-an-email')).toBe(false);
    expect(ok(emailSchema, `${'a'.repeat(245)}@example.com`)).toBe(false);
  });
});

describe('visibilitySchema', () => {
  it('accepts private and public only', () => {
    expect(ok(visibilitySchema, 'private')).toBe(true);
    expect(ok(visibilitySchema, 'public')).toBe(true);
    expect(ok(visibilitySchema, 'friends')).toBe(false);
  });
});

describe('date schemas', () => {
  it('accepts valid calendar dates only', () => {
    expect(ok(diaryDateSchema, '2026-02-28')).toBe(true);
    expect(ok(diaryDateSchema, '2026-02-30')).toBe(false);
    expect(ok(diaryDateSchema, '2026-2-1')).toBe(false);
  });
  it('accepts YYYY-MM months only', () => {
    expect(ok(monthSchema, '2026-11')).toBe(true);
    expect(ok(monthSchema, '2026-13')).toBe(false);
  });
});

// 004 FR-003: NFKC で正規化し、コードポイント数で 12〜128 文字
describe('passwordSchema', () => {
  const issueCode = (value: string) => passwordSchema.safeParse(value).error?.issues[0]?.code;

  it('rejects 11 code points and accepts 12', () => {
    expect(issueCode('a'.repeat(11))).toBe('too_small');
    expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true);
  });

  it('accepts 128 code points and rejects 129', () => {
    expect(passwordSchema.safeParse('a'.repeat(128)).success).toBe(true);
    expect(issueCode('a'.repeat(129))).toBe('too_big');
  });

  it('normalizes full-width characters to half-width', () => {
    expect(passwordSchema.parse('ＡＢＣＤＥＦＧＨＩＪＫＬ')).toBe('ABCDEFGHIJKL');
  });

  it('accepts a Japanese passphrase with spaces', () => {
    expect(passwordSchema.safeParse('きょうは こうえんで あそんだ').success).toBe(true);
  });

  it('counts a combining sequence as one character after normalization', () => {
    const combined = 'か\u3099'.repeat(11); // NFKC で「が」11文字
    expect(issueCode(combined)).toBe('too_small');
    expect(passwordSchema.safeParse(`${combined}が`).success).toBe(true);
  });
});
