// DB のダンプに、本文、天気、メールアドレスの平文が含まれないことを確認する(T123)。
// 復号して得た平文が、DB のどの列にもそのまま現れないことを調べる。
// 実行: npm run verify:encryption
import pg from 'pg';
import { loadConfig } from '../apps/server/src/platform/config.ts';
import { aad, createCipherBox } from '../apps/server/src/platform/crypto.ts';

const config = loadConfig(process.env);
const cipher = createCipherBox(config.encryptionKeys, config.activeKeyVersion);
const client = new pg.Client({ connectionString: config.databaseUrl });
await client.connect();

const secrets = new Set<string>();
const users = await client.query<{ id: string; email_enc: Buffer; key_version: number }>(
  'select id, email_enc, key_version from users',
);
for (const u of users.rows) {
  secrets.add(cipher.decrypt(u.email_enc, u.key_version, aad('user.email', u.id)).toString('utf8'));
}
const diaries = await client.query<{ id: string; content_enc: Buffer; key_version: number }>(
  'select id, content_enc, key_version from diaries',
);
for (const d of diaries.rows) {
  const content = JSON.parse(cipher.decrypt(d.content_enc, d.key_version, aad('diary.content', d.id)).toString('utf8')) as {
    body: string;
  };
  // 短すぎる本文は偶然の一致が起こるため、8文字以上のものだけを調べる
  if (content.body.length >= 8) secrets.add(content.body);
}

const tables = await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
let dump = '';
for (const { tablename } of tables.rows) {
  const rows = await client.query(`select * from "${tablename}"`);
  for (const row of rows.rows as Record<string, unknown>[]) {
    for (const value of Object.values(row)) {
      dump += Buffer.isBuffer(value) ? value.toString('utf8') + value.toString('latin1') : String(value);
      dump += '\n';
    }
  }
}
await client.end();

const leaked = [...secrets].filter((s) => dump.includes(s));
process.stdout.write(`users: ${String(users.rowCount)}, diaries: ${String(diaries.rowCount)}, checked values: ${String(secrets.size)}\n`);
if (leaked.length > 0) {
  process.stderr.write(`平文のまま保存されている値が ${String(leaked.length)} 件あります\n`);
  process.exit(1);
}
process.stdout.write('OK: 平文は見つかりませんでした\n');
