// よく使われるパスワードの一覧を作る(004 T004、ADR-0008)。
// SecLists(MIT License)の Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt を
// 手元にダウンロードし、そのパスを渡して実行する。
//   node scripts/build-common-passwords.ts <SecLists のファイル> > apps/server/src/auth/common-passwords.txt
// 各行を NFKC で正規化して小文字にし、12コードポイント以上のものだけを重複なく出力する
// (12文字未満はパスワードの長さの条件で拒否されるため、一覧に含める必要がない)。
import { readFileSync } from 'node:fs';

const MIN_LENGTH = 12;
const source = process.argv[2];
if (!source) throw new Error('SecLists のファイルのパスを指定してください');

const seen = new Set<string>();
for (const line of readFileSync(source, 'utf8').split(/\r?\n/)) {
  const value = line.normalize('NFKC').toLowerCase();
  if (Array.from(value).length >= MIN_LENGTH) seen.add(value);
}

process.stdout.write('# source: SecLists xato-net-10-million-passwords-1000000.txt (MIT License)\n');
process.stdout.write(`# filtered: NFKC, lowercase, >= ${String(MIN_LENGTH)} code points\n`);
process.stdout.write([...seen].sort().join('\n') + '\n');
