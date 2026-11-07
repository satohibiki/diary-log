# Implementation Plan: 絵日記公開サービス

**Branch**: `001-picture-diary-service` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-picture-diary-service/spec.md`

## Summary

縦書きの絵日記を作成し、承認済みのフォロワーだけに公開できる Web サービスを構築する。
TypeScript の SPA と JSON API を同じ配信元から提供し、データは PostgreSQL に保存する。認証は
ID とパスキーを基本とし、メールのワンタイムパスワードは復旧にのみ使う。本文、天気、画像、
メールアドレスはアプリケーション層で暗号化し、閲覧権限はサーバーの単一のポリシーで判定する。

## Technical Context

**Language/Version**: TypeScript(strict)、Node.js 26 LTS

**Primary Dependencies**: React、React Router、Vite、Hono、Zod、Drizzle ORM、SimpleWebAuthn、
sharp、Nodemailer、fflate(選定理由は [research.md](./research.md))

**Storage**: PostgreSQL 18(画像を含む全データ)。端末には保存前の入力内容のみを IndexedDB に
一時保持する

**Testing**: Vitest、Testing Library、Playwright(仮想認証器)、実 PostgreSQL への統合テスト

**Target Platform**: Linux コンテナ1台とマネージド PostgreSQL。Chrome、Edge、Firefox、Safari の
最新安定版

**Project Type**: Web アプリケーション(SPA + JSON API)

**Performance Goals**: 一覧の95%が2秒以内(SC-008)、過去の絵日記を10秒以内に表示(SC-003)、
非公開化が5秒以内に反映(SC-005)

**Constraints**: オンライン必須、パスワード不使用、外部スクリプトと外部送信なし(メールを除く)、
インラインスクリプト禁止、幅360pxで横スクロールなし、日記データを端末にキャッシュしない

**Scale/Scope**: 初期は利用者1,000人程度、1人あたり年365件、画面数約15、API 約40

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

判定: **設計後の再確認でも合格**(逸脱なし)

| 原則・要件 | 判定 | 設計での対応 |
|---|---|---|
| I. セキュリティ最優先 | 合格 | 下記の脅威モデル、入力の検証、文字としての表示、厳格な CSP |
| II. サーバー保存とデータの最小化 | 合格 | 個人情報はメールのみ、日付を除き暗号化保存、`no-store`、端末は入力中の内容のみ |
| III. プライバシー保護 | 合格 | 外部スクリプトなし、許可リスト方式のログ、メールに日記の内容を含めない |
| IV. データの保全と可搬性 | 合格 | IndexedDB の下書き、ZIP のエクスポートとインポート、削除の確認、Drizzle のマイグレーション |
| V. テスト駆動開発 | 合格 | tasks でテストを実装より先に配置 |
| VI. シンプルさ | 合格 | サーバー1プロセス、データストア1つ、キューと外部ストレージなし |
| VII. DRY | 合格 | 検証スキーマを `packages/shared` に集約、閲覧権限は1関数に集約 |
| VIII. 明示的なエラー処理 | 合格 | 代替処理なし、エラーは RFC 9457 形式で返して画面に表示 |
| Web プラットフォーム要件 | 合格 | 主要4ブラウザの E2E、幅360pxとキーボード操作の検証 |
| 品質ゲート | 合格 | テスト、lint、型検査、脆弱性検査、秘密情報の検査を `npm run verify` にまとめ、pre-push フックと CI で実行 |
| ADR | 合格 | `docs/adr/0001`〜`0004`(提案中)。運営者のアクセス、ホスティング、メール配信は tasks で 0005〜0007 に記録 |

## Security Threat Model

憲章の原則 I に基づき、扱うデータ、脅威、および対策を記載する。

**扱うデータ**: 絵日記の本文・天気・画像・日付、プロフィール、メールアドレス、パスキーの公開鍵、
ワンタイムパスワードのハッシュ、セッションのハッシュ

| 脅威 | 対策 |
|---|---|
| 権限のない閲覧(IDOR) | 閲覧条件を SQL の述語 `viewableOwnerCondition` に一本化。権限なしと不存在を同じ404で返す。組み合わせを網羅してテスト |
| XSS | React の文字列表示のみ、HTML の直接挿入を lint で禁止、`script-src 'self'` の CSP |
| CSRF | `SameSite=Strict` の Cookie、`Origin` の検証、JSON または multipart の要求のみ受理 |
| セッションの窃取 | 256ビットの乱数、`HttpOnly` `Secure` `__Host-` Cookie、DB にはハッシュのみ保存、30日で失効 |
| メールの乗っ取りによる復旧 | 新しいパスキーの登録のみ許可、既存セッションの失効、登録先への通知 |
| ワンタイムパスワードの総当たり | 8桁、10分、1回限り、5回まで、同時に3件まで、送信と検証の回数制限 |
| 回数制限を悪用した妨害 | ログインの制限は IP と ID の組み合わせを基準とし、ID 単独では止めない。再送で本人のコードを無効にしない |
| ID の列挙 | ログインと復旧の応答を ID の有無で変えない、検索と登録の回数制限 |
| 悪意ある画像 | sharp で再エンコード、ピクセル数の上限、`nosniff`、配信は認可付きの API のみ |
| 位置情報の漏えい | 再エンコードで全メタデータを除去。E2E で確認 |
| DB やバックアップの漏えい | AES-256-GCM による保存時暗号化、鍵は DB の外で管理、レコードに紐づけた AAD |
| 共有端末への残留 | `Cache-Control: no-store`、ログアウト時に下書きを消去 |
| 依存関係の脆弱性 | `npm audit` を品質ゲートに追加、依存を最小限に維持 |
| ログからの漏えい | 許可したフィールドだけを出力するロガー。テストで機密値の不在を確認 |

**残るリスク**: 暗号鍵を持つ運営者は技術的に内容を読める。タブを閉じただけの場合、下書きは端末に
残る。メールアドレスは配信事業者に渡る。第三者が他人の ID で誤った入力を繰り返すと、
ワンタイムパスワードを失効させて復旧を妨害できる。

## Project Structure

### Documentation (this feature)

```text
specs/001-picture-diary-service/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── tasks.md             # /speckit-tasks で作成
```

### Source Code (repository root)

```text
apps/
├── server/
│   ├── src/
│   │   ├── auth/          # パスキー、セッション、ワンタイムパスワード、復旧
│   │   ├── diaries/       # 絵日記、カレンダー、エクスポート
│   │   ├── social/        # フォロー、ブロック、フィード、閲覧権限
│   │   ├── profile/       # プロフィール、アカウント
│   │   ├── platform/      # DB、暗号化、画像、メール、ログ、回数制限、セキュリティヘッダー
│   │   └── app.ts
│   ├── drizzle/           # マイグレーション
│   └── tests/
└── web/
    ├── src/
    │   ├── features/      # auth、diary、calendar、profile、social、legal
    │   ├── components/
    │   └── lib/           # API クライアント、下書きの保持
    └── tests/
packages/
└── shared/                # 検証スキーマと API の型
e2e/                       # Playwright
scripts/                   # 開発用証明書、暗号化の確認
docs/
├── adr/                   # ADR
├── operations/            # 本番の運用記録
└── export-format.md       # エクスポート形式の公開仕様
.githooks/pre-push
.github/workflows/ci.yml
.secretlintrc.json
compose.yaml               # 開発用の PostgreSQL とメール確認ツール
Dockerfile
```

**Structure Decision**: npm workspaces による構成とする。検証ルールをブラウザとサーバーで共有する
ために `packages/shared` を設ける。本番は1つのコンテナが API と SPA を同じ配信元から提供する。

## Complexity Tracking

憲章の違反はない。
