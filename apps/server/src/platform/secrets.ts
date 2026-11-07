// ワンタイムパスワード、トークン、HMAC。比較は定数時間で行う
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export type Secrets = {
  generateOtp: () => string;
  hmac: (purpose: string, value: string) => Buffer;
  verifyHmac: (purpose: string, value: string, stored: Buffer) => boolean;
  newToken: () => string;
  hashToken: (token: string) => Buffer;
};

export function createSecrets(key: Buffer): Secrets {
  const hmac = (purpose: string, value: string) =>
    createHmac('sha256', key).update(purpose).update('\u0000').update(value).digest();
  return {
    generateOtp: () => randomInt(0, 100_000_000).toString().padStart(8, '0'),
    hmac,
    verifyHmac(purpose, value, stored) {
      const actual = hmac(purpose, value);
      return actual.length === stored.length && timingSafeEqual(actual, stored);
    },
    newToken: () => randomBytes(32).toString('base64url'),
    hashToken: (token) => createHash('sha256').update(token).digest(),
  };
}
