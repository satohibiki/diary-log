// 統合テストの開始時に、専用のデータベースを作り直してマイグレーションを適用する
import './env.ts';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';

export default async function setup(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error('統合テストのデータベース名は _test で終わる必要があります');
  }
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const pool = new pg.Pool({ connectionString: url.toString() });
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  });
  await pool.end();
}
