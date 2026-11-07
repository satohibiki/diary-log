// 本番と開発のエントリーポイント
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import nodemailer from 'nodemailer';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createApp } from './app.ts';
import { startCleanup } from './platform/cleanup.ts';
import { loadConfig } from './platform/config.ts';
import { createCipherBox } from './platform/crypto.ts';
import { createDb } from './platform/db/client.ts';
import { createLogger } from './platform/logger.ts';
import { createMailer } from './platform/mail.ts';
import { createRateLimiter } from './platform/rate-limit.ts';
import { createSecrets } from './platform/secrets.ts';

const config = loadConfig(process.env);
const logger = createLogger();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
const db = createDb(pool);
const secrets = createSecrets(config.hmacSecret);
const now = () => new Date();
// リバースプロキシの背後で動かす場合のみ、X-Forwarded-For の先頭を利用者の IP とみなす
const trustProxy = process.env.TRUST_PROXY === 'true';

const app = createApp({
  config,
  db,
  cipher: createCipherBox(config.encryptionKeys, config.activeKeyVersion),
  secrets,
  mailer: createMailer(nodemailer.createTransport(config.smtpUrl), config.mailFrom),
  logger,
  rateLimiter: createRateLimiter({ db, secrets, now }),
  now,
  clientIp: (c) => {
    const forwarded = trustProxy ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
    return forwarded ?? getConnInfo(c).remote.address ?? 'unknown';
  },
  staticRoot: fileURLToPath(new URL('../../web/dist', import.meta.url)),
});

startCleanup({ db, logger, now });
serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info('listening', { count: info.port });
});
