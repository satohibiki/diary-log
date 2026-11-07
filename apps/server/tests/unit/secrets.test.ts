import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSecrets } from '../../src/platform/secrets.ts';

const secrets = createSecrets(randomBytes(32));

describe('createSecrets', () => {
  it('generates 8-digit one-time passwords', () => {
    const codes = new Set(Array.from({ length: 200 }, () => secrets.generateOtp()));
    for (const code of codes) expect(code).toMatch(/^\d{8}$/);
    expect(codes.size).toBeGreaterThan(190);
  });

  it('verifies a one-time password against its HMAC', () => {
    const code = secrets.generateOtp();
    const stored = secrets.hmac('otp', code);
    expect(secrets.verifyHmac('otp', code, stored)).toBe(true);
    expect(secrets.verifyHmac('otp', '00000000', stored)).toBe(code === '00000000');
  });

  it('separates HMACs by purpose', () => {
    expect(secrets.hmac('a', 'x').equals(secrets.hmac('b', 'x'))).toBe(false);
  });

  it('returns false instead of throwing for a stored value of a different length', () => {
    expect(secrets.verifyHmac('otp', '12345678', Buffer.alloc(3))).toBe(false);
  });

  it('creates unguessable tokens and hashes them with SHA-256', () => {
    const token = secrets.newToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(secrets.hashToken(token)).toHaveLength(32);
    expect(secrets.hashToken(token).equals(secrets.hashToken(secrets.newToken()))).toBe(false);
  });
});
