// 統合テスト用の DB 接続。テストごとに全テーブルを空にしてデータを隔離する
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../../src/platform/db/client.ts';

let pool: pg.Pool | undefined;
let db: Db | undefined;

export function testDb(): Db {
  if (!db) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    db = createDb(pool);
  }
  return db;
}

export async function resetDb(): Promise<void> {
  await testDb().execute(sql`
    TRUNCATE users, passkeys, sessions, webauthn_challenges, pending_registrations,
      email_otps, diaries, follows, blocks, rate_limits RESTART IDENTITY CASCADE
  `);
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}
