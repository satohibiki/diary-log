// パスワードのハッシュ、比較、条件の判定(004 FR-003、FR-004、FR-005、research.md §1〜§3)
import { scryptSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkPasswordRules, hashPassword, internals, verifyAgainstDummy, verifyPassword } from '../../src/auth/password.ts';

const PASSWORD = 'correct horse battery staple';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hashPassword', () => {
  it('stores a self-describing scrypt hash with a random salt and without the password', async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    expect(a).toMatch(/^scrypt\$15\$8\$3\$[\w-]+\$[\w-]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain(PASSWORD);
    expect(a).not.toContain(Buffer.from(PASSWORD).toString('base64url'));
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(await verifyPassword(`${PASSWORD}!`, hash)).toBe(false);
  });

  it('reads the parameters from the stored hash', async () => {
    const salt = Buffer.from('0123456789abcdef');
    const derived = scryptSync(PASSWORD, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
    const stored = `scrypt$14$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
  });

  it('fails on a broken hash', async () => {
    await expect(verifyPassword(PASSWORD, 'scrypt$15$8')).rejects.toThrow();
    await expect(verifyPassword(PASSWORD, 'bcrypt$a$b$c$d$e')).rejects.toThrow();
  });
});

describe('verifyAgainstDummy', () => {
  it('always fails after the same amount of work as a real comparison', async () => {
    const hash = await hashPassword(PASSWORD);
    const derive = vi.spyOn(internals, 'derive');
    await verifyPassword(PASSWORD, hash);
    expect(derive).toHaveBeenCalledTimes(1);
    expect(await verifyAgainstDummy(PASSWORD)).toBe(false);
    expect(derive).toHaveBeenCalledTimes(2);
    expect(derive.mock.calls[1]?.[2]).toEqual(derive.mock.calls[0]?.[2]);
  });
});

describe('checkPasswordRules', () => {
  it('rejects a commonly used password ignoring case', () => {
    expect(checkPasswordRules('PasswordPassword', 'alice')).toEqual(['common']);
  });

  it('rejects a password that contains the ID ignoring case', () => {
    expect(checkPasswordRules('my-ALICE-diary-2026', 'alice')).toEqual(['contains_handle']);
  });

  it('accepts a good password', () => {
    expect(checkPasswordRules(PASSWORD, 'alice')).toEqual([]);
  });

  it('ignores the comment lines of the list', () => {
    expect(checkPasswordRules('# source: SecLists xato-net-10-million-passwords-1000000.txt (MIT License)', 'alice')).toEqual(
      [],
    );
  });
});
