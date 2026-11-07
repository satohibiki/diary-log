// マイグレーションを適用する: npm run db:migrate
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL が設定されていません');
const pool = new pg.Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)) });
await pool.end();
process.stdout.write('migrations applied\n');
