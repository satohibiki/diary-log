// パスワードのハッシュ、比較、条件の判定(004 FR-003、FR-004、FR-005、ADR-0008)。
// 入力のパスワードは、ログ、例外のメッセージのどこにも含めない
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Params = { logN: number; r: number; p: number };

const CURRENT: Params = { logN: 15, r: 8, p: 3 };
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MAX_MEMORY = 64 * 1024 * 1024;

/** テストで計算の回数を数えられるよう、scrypt の呼び出しをここにまとめる */
export const internals = {
  derive(password: string, salt: Buffer, params: Params): Promise<Buffer> {
    const options: ScryptOptions = { N: 2 ** params.logN, r: params.r, p: params.p, maxmem: MAX_MEMORY };
    return new Promise((resolve, reject) => {
      scrypt(password, salt, KEY_BYTES, options, (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
  },
};

function encode(params: Params, salt: Buffer, key: Buffer): string {
  return `scrypt$${String(params.logN)}$${String(params.r)}$${String(params.p)}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function decode(stored: string): { params: Params; salt: Buffer; key: Buffer } {
  const [kind, logN, r, p, salt, key, ...rest] = stored.split('$');
  const numbers = [logN, r, p].map(Number);
  if (kind !== 'scrypt' || rest.length > 0 || !salt || !key || numbers.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new Error('パスワードのハッシュの形式が不正です');
  }
  const [n = 0, rr = 0, pp = 0] = numbers;
  return { params: { logN: n, r: rr, p: pp }, salt: Buffer.from(salt, 'base64url'), key: Buffer.from(key, 'base64url') };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  return encode(CURRENT, salt, await internals.derive(password, salt, CURRENT));
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const { params, salt, key } = decode(stored);
  const actual = await internals.derive(password, salt, params);
  return actual.length === key.length && timingSafeEqual(actual, key);
}

// ID が存在しない場合なども同じ計算を行い、応答の時間をそろえる(FR-005)
const dummy = encode(CURRENT, randomBytes(SALT_BYTES), randomBytes(KEY_BYTES));

export async function verifyAgainstDummy(password: string): Promise<false> {
  await verifyPassword(password, dummy);
  return false;
}

let common: Set<string> | undefined;

function commonPasswords(): Set<string> {
  common ??= new Set(
    readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('#')),
  );
  return common;
}

export type PasswordRule = 'common' | 'contains_handle';

/** passwordSchema で正規化したパスワードの、一覧と ID の条件を判定する */
export function checkPasswordRules(password: string, handle: string): PasswordRule[] {
  const lower = password.toLowerCase();
  const failed: PasswordRule[] = [];
  if (commonPasswords().has(lower)) failed.push('common');
  if (lower.includes(handle.toLowerCase())) failed.push('contains_handle');
  return failed;
}
