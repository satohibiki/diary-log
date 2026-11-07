import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCipherBox } from '../../src/platform/crypto.ts';

const k1 = randomBytes(32);
const k2 = randomBytes(32);

describe('createCipherBox', () => {
  it('round-trips with the active key and reports its version', () => {
    const box = createCipherBox(new Map([[1, k1]]), 1);
    const sealed = box.encrypt(Buffer.from('今日は晴れ'), 'diary.content:abc');
    expect(sealed.keyVersion).toBe(1);
    expect(sealed.ciphertext.includes(Buffer.from('今日は晴れ'))).toBe(false);
    expect(box.decrypt(sealed.ciphertext, sealed.keyVersion, 'diary.content:abc').toString()).toBe(
      '今日は晴れ',
    );
  });

  it('produces different ciphertexts for the same plaintext', () => {
    const box = createCipherBox(new Map([[1, k1]]), 1);
    const a = box.encrypt(Buffer.from('same'), 'x:1');
    const b = box.encrypt(Buffer.from('same'), 'x:1');
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('rejects ciphertext moved to another record (AAD mismatch)', () => {
    const box = createCipherBox(new Map([[1, k1]]), 1);
    const sealed = box.encrypt(Buffer.from('secret'), 'user.email:u1');
    expect(() => box.decrypt(sealed.ciphertext, 1, 'user.email:u2')).toThrow();
  });

  it('detects tampering', () => {
    const box = createCipherBox(new Map([[1, k1]]), 1);
    const sealed = box.encrypt(Buffer.from('secret'), 'x:1');
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 0xff;
    expect(() => box.decrypt(tampered, 1, 'x:1')).toThrow();
  });

  it('decrypts data written with an older key version after rotation', () => {
    const old = createCipherBox(new Map([[1, k1]]), 1);
    const sealed = old.encrypt(Buffer.from('past'), 'x:1');
    const rotated = createCipherBox(
      new Map([
        [1, k1],
        [2, k2],
      ]),
      2,
    );
    expect(rotated.decrypt(sealed.ciphertext, 1, 'x:1').toString()).toBe('past');
    expect(rotated.encrypt(Buffer.from('new'), 'x:1').keyVersion).toBe(2);
  });

  it('fails for an unknown key version', () => {
    const box = createCipherBox(new Map([[1, k1]]), 1);
    const sealed = box.encrypt(Buffer.from('a'), 'x:1');
    expect(() => box.decrypt(sealed.ciphertext, 9, 'x:1')).toThrow();
  });
});
