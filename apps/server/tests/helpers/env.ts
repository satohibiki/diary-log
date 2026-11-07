// テスト用の環境変数。開発用の .env には依存しない
import { randomBytes } from 'node:crypto';

const key = () => randomBytes(32).toString('base64');

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://diary:diary@localhost:5432/diary_test';
process.env.APP_ORIGIN = 'https://localhost:5173';
process.env.RP_ID = 'localhost';
process.env.RP_NAME = 'diary-log';
process.env.DATA_ENCRYPTION_KEYS = `1:${key()}`;
process.env.ACTIVE_KEY_VERSION = '1';
process.env.HMAC_SECRET = key();
process.env.SMTP_URL = 'smtp://localhost:1025';
process.env.MAIL_FROM = 'diary-log <no-reply@localhost>';
process.env.PORT = '0';
