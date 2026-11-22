# diary-log

紙の絵日記帳のようなページに絵日記を書き、承認したフォロワーだけに公開できる Web サービスです。パスワードは使わず、
ID とパスキーでログインします。仕様と設計は [specs/001-picture-diary-service](specs/001-picture-diary-service/) と
[specs/002-handwritten-diary-ui](specs/002-handwritten-diary-ui/) を、開発の原則は [憲章](.specify/memory/constitution.md)
を参照してください。

手書き風の書体(Klee One、SIL Open Font License 1.1)は、外部のサービスから読み込まず、このサービスから配信します
([ADR-0006](docs/adr/0006-handwriting-font.md))。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `apps/server` | API(Hono)。SPA の配信も行う |
| `apps/web` | 画面(React、Vite) |
| `packages/shared` | ブラウザとサーバーで共有する検証スキーマと型 |
| `e2e` | Playwright の E2E テスト |
| `docs/adr` | 設計判断の記録 |

## 開発の準備

必要なもの: Node.js 26、Docker、mkcert

```bash
npm ci
mkcert -install          # 初回のみ。ローカルの認証局を信頼させる
sh scripts/dev-certs.sh  # 開発用の HTTPS 証明書を .certs/ に作成する
cp .env.example .env     # REPLACE_ME をファイル内の説明に従って置き換える
docker compose up -d     # PostgreSQL と開発用メールサーバー(Mailpit)
npm run db:migrate
npm run dev
```

- アプリ: <https://localhost:5173>
- 開発用メール(ワンタイムパスワードの確認): <http://localhost:8025>

### 同じネットワークの別の端末から試す

IP アドレスではパスキーを使えないため、Mac のホスト名(`<LocalHostName>.local`)で開く。

```bash
sh scripts/dev-certs.sh "$(scutil --get LocalHostName | tr A-Z a-z).local"  # ホスト名を含む証明書を作り直す
```

`.env` の `APP_ORIGIN` を `https://<ホスト名>.local:5173`、`RP_ID` を `<ホスト名>.local` に変える(小文字で書く)。
`APP_ORIGIN` が localhost 以外のときだけ、開発サーバーは同じネットワークの端末からの接続を受け付ける。

- 端末には mkcert の認証局(`mkcert -CAROOT` のフォルダーの `rootCA.pem`)を入れて信頼させる。
- `RP_ID` ごとにパスキーは別になる。localhost で作ったパスキーではログインできない。
- E2E は `https://localhost:5173` で動くため、実行する前に `.env` を localhost に戻す。
- 試し終えたら `.env` を localhost に戻し、同じネットワークからの接続を受け付けない状態にする。

## テストと品質ゲート

```bash
npm run verify      # 型検査、lint、テスト、脆弱性検査、秘密情報の検査
npm run test:e2e    # E2E(開発サーバーと、性能の測定用に本番用にビルドした画面 https://localhost:4173 を自動で起動する)
npm run verify:encryption  # DB に平文の本文やメールアドレスがないことを確認する
```

`npm ci` で `.githooks/pre-push` が有効になり、push の前に `npm run verify` が実行されます。失敗した状態では
push できません(憲章の品質ゲート)。

パスキーの E2E は Chromium の仮想認証器で実行します。Firefox と Safari のパスキーは手動で確認します。

## 本番の運用

### 起動

```bash
docker build -t diary-log .
docker run --env-file production.env -p 3000:3000 diary-log
```

マイグレーションはデプロイのたびに、アプリの起動前に実行します。

```bash
docker run --env-file production.env diary-log node apps/server/src/platform/db/migrate.ts
```

TLS はリバースプロキシで終端します。プロキシの背後で動かす場合は `TRUST_PROXY=true` を設定し、
`X-Forwarded-For` から利用者の IP を取得します。

### 環境変数

| 名前 | 内容 |
|---|---|
| `DATABASE_URL` | PostgreSQL の接続文字列 |
| `APP_ORIGIN` | 公開する URL の origin(https) |
| `RP_ID` | パスキーの RP ID(通常はドメイン名) |
| `RP_NAME` | パスキーに表示するサービス名 |
| `DATA_ENCRYPTION_KEYS` | 暗号鍵。`<バージョン>:<base64 の32バイト>` をカンマ区切り |
| `ACTIVE_KEY_VERSION` | 新しく暗号化するときに使う鍵のバージョン |
| `HMAC_SECRET` | ワンタイムパスワードなどの HMAC の鍵(base64、32バイト以上) |
| `SMTP_URL`、`MAIL_FROM` | メールの送信設定 |
| `PORT` | 待ち受けるポート |
| `TRUST_PROXY` | `true` の場合のみ `X-Forwarded-For` を信頼する |

### 暗号鍵のバックアップ(必須)

**暗号鍵を失うと、すべての絵日記とメールアドレスが復号できなくなります。** DB のバックアップとは別の場所に、
アクセスを制限して保管してください(ADR-0002、ADR-0005)。

- 鍵は DB と同じ場所に保管しない
- 鍵を参照できる人を最小限にし、参照を記録する
- 鍵を交換するときは、新しい鍵を `DATA_ENCRYPTION_KEYS` に追加して `ACTIVE_KEY_VERSION` を切り替える。
  古い鍵は、その鍵で暗号化されたデータがなくなるまで削除しない

### バックアップ

DB のバックアップは最長30日で削除されるよう設定します(research.md §14)。利用者には、削除したデータが
バックアップに最長30日残ることを説明しています(`/privacy`)。

一般公開の前に、`specs/001-picture-diary-service/tasks.md` の Phase 9(Deployment Readiness)をすべて完了してください。
