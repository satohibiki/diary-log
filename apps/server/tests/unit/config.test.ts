import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/platform/config.ts';

const secret = randomBytes(32).toString('base64');
const validEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  APP_ORIGIN: 'https://localhost:5173',
  RP_ID: 'localhost',
  RP_NAME: 'diary-log',
  DATA_ENCRYPTION_KEYS: `1:${secret},2:${randomBytes(32).toString('base64')}`,
  ACTIVE_KEY_VERSION: '2',
  HMAC_SECRET: randomBytes(32).toString('base64'),
  SMTP_URL: 'smtp://localhost:1025',
  MAIL_FROM: 'diary-log <no-reply@localhost>',
  PORT: '3000',
};

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const config = loadConfig(validEnv);
    expect(config.port).toBe(3000);
    expect(config.activeKeyVersion).toBe(2);
    expect([...config.encryptionKeys.keys()]).toEqual([1, 2]);
    expect(config.encryptionKeys.get(1)?.length).toBe(32);
  });

  it.each(Object.keys(validEnv))('fails when %s is missing', (name) => {
    const env = Object.fromEntries(Object.entries(validEnv).filter(([key]) => key !== name));
    expect(() => loadConfig(env)).toThrow(name);
  });

  it('fails when an encryption key is not 32 bytes', () => {
    expect(() => loadConfig({ ...validEnv, DATA_ENCRYPTION_KEYS: '1:c2hvcnQ=' })).toThrow(
      'DATA_ENCRYPTION_KEYS',
    );
  });

  it('fails when DATA_ENCRYPTION_KEYS is malformed', () => {
    expect(() => loadConfig({ ...validEnv, DATA_ENCRYPTION_KEYS: secret })).toThrow(
      'DATA_ENCRYPTION_KEYS',
    );
  });

  it('fails when the active key version has no key', () => {
    expect(() => loadConfig({ ...validEnv, ACTIVE_KEY_VERSION: '3' })).toThrow('ACTIVE_KEY_VERSION');
  });

  it('never includes secret values in error messages', () => {
    try {
      loadConfig({ ...validEnv, ACTIVE_KEY_VERSION: '3' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
