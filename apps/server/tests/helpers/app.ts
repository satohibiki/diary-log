// テスト用にアプリを組み立て、Cookie を保持するクライアントを提供する
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppDeps } from '../../src/app.ts';
import { loadConfig } from '../../src/platform/config.ts';
import { createCipherBox } from '../../src/platform/crypto.ts';
import { createLogger } from '../../src/platform/logger.ts';
import { createMailer, type MailMessage } from '../../src/platform/mail.ts';
import { createRateLimiter } from '../../src/platform/rate-limit.ts';
import { createSecrets } from '../../src/platform/secrets.ts';
import { testDb } from './db.ts';

export const ORIGIN = 'https://localhost:5173';

export type TestContext = ReturnType<typeof buildTestContext>;

export function buildTestContext(options: { now?: () => Date; failMail?: boolean } = {}) {
  const config = loadConfig(process.env);
  const db = testDb();
  const outbox: MailMessage[] = [];
  const logs: string[] = [];
  const secrets = createSecrets(config.hmacSecret);
  const now = options.now ?? (() => new Date());
  const staticRoot = mkdtempSync(join(tmpdir(), 'diary-static-'));
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><title>diary</title>');
  const deps: AppDeps = {
    config,
    db,
    cipher: createCipherBox(config.encryptionKeys, config.activeKeyVersion),
    secrets,
    mailer: createMailer(
      {
        sendMail: (message) => {
          if (options.failMail) return Promise.reject(new Error('smtp unavailable'));
          outbox.push(message);
          return Promise.resolve();
        },
      },
      config.mailFrom,
    ),
    logger: createLogger((line) => logs.push(line)),
    rateLimiter: createRateLimiter({ db, secrets, now }),
    now,
    clientIp: (c) => c.req.header('x-test-ip') ?? '203.0.113.1',
    staticRoot,
  };
  const app = createApp(deps);
  return { app, deps, outbox, logs, client: () => new TestClient(app) };
}

type Body = { json?: unknown; form?: FormData; headers?: Record<string, string> };

export class TestClient {
  readonly #app: ReturnType<typeof createApp>;
  readonly cookies = new Map<string, string>();

  constructor(app: ReturnType<typeof createApp>) {
    this.#app = app;
  }

  async request(method: string, path: string, body: Body = {}): Promise<Response> {
    const headers: Record<string, string> = { origin: ORIGIN, ...body.headers };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    let payload: string | FormData | undefined;
    if (body.json !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body.json);
    } else if (body.form) {
      payload = body.form;
    }
    const res = await this.#app.request(`https://localhost${path}`, { method, headers, body: payload });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (/max-age=0/i.test(cookie) || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  get(path: string, headers?: Record<string, string>) {
    return this.request('GET', path, headers ? { headers } : {});
  }
  post(path: string, json?: unknown) {
    return this.request('POST', path, json === undefined ? {} : { json });
  }
  patch(path: string, json: unknown) {
    return this.request('PATCH', path, { json });
  }
  put(path: string, json?: unknown) {
    return this.request('PUT', path, json === undefined ? {} : { json });
  }
  delete(path: string) {
    return this.request('DELETE', path);
  }
  postForm(path: string, form: FormData) {
    return this.request('POST', path, { form });
  }
  putForm(path: string, form: FormData) {
    return this.request('PUT', path, { form });
  }
}

/** 最後に送られたメールからワンタイムパスワードを取り出す */
export function lastOtp(outbox: MailMessage[], to?: string): string {
  const message = [...outbox].reverse().find((m) => to === undefined || m.to === to);
  const code = /\b(\d{8})\b/.exec(message?.text ?? '')?.[1];
  if (!code) throw new Error('ワンタイムパスワードのメールがありません');
  return code;
}
