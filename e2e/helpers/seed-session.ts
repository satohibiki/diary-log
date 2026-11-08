// E2E 用: テスト用 DB に利用者とセッションを直接作成し、ログイン済みの状態を用意する。
// パスキーの仮想認証器がない Firefox と WebKit で使う。アプリのコードにはテスト用の認証経路を追加しない。
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';
import pg from 'pg';
import sharp from 'sharp';
import { loadConfig } from '../../apps/server/src/platform/config.ts';
import { aad, createCipherBox } from '../../apps/server/src/platform/crypto.ts';

process.loadEnvFile('.env');
const config = loadConfig(process.env);
const cipher = createCipherBox(config.encryptionKeys, config.activeKeyVersion);

export type SeededUser = { id: string; handle: string; email: string };

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function seedUser(handle: string, visibility: 'private' | 'public' = 'private'): Promise<SeededUser> {
  const id = randomUUID();
  const email = `${handle}@example.com`;
  const sealed = cipher.encrypt(Buffer.from(email), `user.email:${id}`);
  await withClient((client) =>
    client.query(
      'insert into users (id, handle, nickname, email_enc, key_version, visibility) values ($1, $2, $3, $4, $5, $6)',
      [id, handle, handle, sealed.ciphertext, sealed.keyVersion, visibility],
    ),
  );
  return { id, handle, email };
}

/** 承認済みのフォロー関係を作る */
export async function seedFollow(follower: SeededUser, followee: SeededUser): Promise<void> {
  await withClient((client) =>
    client.query(
      "insert into follows (follower_id, followee_id, status, approved_at) values ($1, $2, 'approved', now())",
      [follower.id, followee.id],
    ),
  );
}

/** セッションを作成し、ブラウザのコンテキストに Cookie を設定する */
export async function signInAs(context: BrowserContext, user: SeededUser): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest();
  await withClient((client) =>
    client.query(
      "insert into sessions (token_hash, user_id, scope, expires_at) values ($1, $2, 'full', now() + interval '1 day')",
      [tokenHash, user.id],
    ),
  );
  await context.addCookies([
    { name: '__Host-session', value: token, url: config.appOrigin, httpOnly: true, secure: true, sameSite: 'Strict' },
  ]);
}

// 回数制限は DB に保存されるため、E2E を繰り返し実行するとメール送信の上限(IP ごとに1時間10回)に達する。
// 認証の E2E の前に開発用 DB の記録を消去する
export async function resetRateLimits(): Promise<void> {
  await withClient((client) => client.query('delete from rate_limits'));
}

/** 絵日記を DB に直接作る。001 の縦書きの画面で作った既存の絵日記の代わりに使う(保存形式は同じ) */
export async function seedDiary(
  user: SeededUser,
  date: string,
  content: { body: string; weather: 'sunny' | 'cloudy' | 'rainy' | 'snowy' },
): Promise<void> {
  const id = randomUUID();
  const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#c9a27e' } }).webp().toBuffer();
  const sealedContent = cipher.encrypt(Buffer.from(JSON.stringify(content)), aad('diary.content', id));
  const sealedImage = cipher.encrypt(image, aad('diary.image', id));
  await withClient((client) =>
    client.query(
      'insert into diaries (id, user_id, diary_date, content_enc, image_enc, key_version) values ($1, $2, $3, $4, $5, $6)',
      [id, user.id, date, sealedContent.ciphertext, sealedImage.ciphertext, sealedContent.keyVersion],
    ),
  );
}
