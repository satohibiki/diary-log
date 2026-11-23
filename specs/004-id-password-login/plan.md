# Implementation Plan: ID とパスワードでのログイン(パスキーも利用可)

**Branch**: `004-id-password-login` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-id-password-login/spec.md`

## Summary

ログインの標準の方法を ID とパスワードにし、パスキーでのログインも残す。初めて使う端末では、パスワードに加えてメールのワンタイムパスワード(OTP)を求める(Clarifications の回答 B)。

- **パスワード**: Node.js 標準の `crypto.scrypt`(N=2^15、r=8、p=3)とユーザーごとのソルトで保存する。NFKC で正規化し、12〜128文字にする。よく使われるパスワードと、ID を含むパスワードを拒否する。
- **端末の確認**: 確認済みの端末は Cookie `__Host-device` のトークンで見分け、DB にはハッシュだけを保存する。90日で失効し、パスワードの変更と復旧で全失効する。
- **登録と復旧**: 登録はパスワードで行い、パスキーは登録後に追加する。復旧は、新しいパスワードの設定と新しいパスキーの登録から選べる。
- **本人確認(step-up)**: パスワードでも行えるようにし、パスワードだけの利用者もパスキーの管理、メールアドレスの変更、退会をできるようにする。

詳しくは [research.md](./research.md)、API は [contracts/auth-api.md](./contracts/auth-api.md) を参照。

## Technical Context

**Language/Version**: TypeScript 6.0(strict)、Node.js 26

**Primary Dependencies**: 既存の Hono、drizzle-orm、pg、zod、@simplewebauthn/server と browser、nodemailer、React 19、react-router 8。**追加なし**(ハッシュは `node:crypto` の scrypt)。

**Storage**: PostgreSQL。`users` に `password_hash`、`password_changed_at` を追加。`trusted_devices` を新設。列挙型 `session_scope` に `device_check`、`otp_purpose` に `new_device` を追加([data-model.md](./data-model.md))。

**Testing**: Vitest(サーバーの単体と、実 DB の統合テスト。画面は jsdom)、Playwright(Chromium、Firefox、WebKit、mobile-360)、Mailpit で OTP を受け取る。

**Target Platform**: Chrome、Edge、Firefox、Safari の最新安定版。パスキーに対応していない環境を含む。

**Project Type**: Web アプリ(npm workspaces: `apps/web`、`apps/server`、`packages/shared`)

**Performance Goals**: パスワードの比較は1回あたりおおむね 100ms 前後(scrypt のコスト)。ログインは SC-002 の30秒以内に十分収まる。

**Constraints**:
- パスワードの値を、DB、ログ、エラー、メール、エクスポートに残さない(FR-004、SC-005)。
- ID の有無を応答の内容と時間で区別させない(FR-005、SC-004)。
- 端末を特定できる情報を保存しない。
- 既存のパスキーだけの利用者のログインを変えない(FR-013、SC-003)。

**Scale/Scope**:
- サーバー: 新しい API が7本(パスワードでのログイン、端末の確認と再送、復旧のパスワードとパスキーのオプション、パスワードでの step-up、パスワードの変更)。変更する API が5本。
- 画面: 4つ(ログイン、登録、復旧、セキュリティ設定)と、退会の本人確認。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. セキュリティ最優先 | PASS(要注意) | パスワードを扱うことはリスクを増やす。利用できる端末を広げるという利用者の要求に対し、scrypt での保存、回数制限、ID の列挙の防止、初めての端末での OTP、変更の通知で抑える。脅威と対策は research.md §13。外部の値(パスワード、OTP、Cookie)はすべて検証する |
| II. サーバー保存とデータの最小化 | PASS | 個人情報は増えない(パスワードのハッシュは個人情報ではなく認証情報)。端末の確認は乱数のトークンのハッシュだけで、User-Agent や IP は保存しない。`password_hash` は復元できない形のため暗号化の対象外とし、ADR-0008 に記録する |
| III. プライバシー保護 | PASS | よく使われるパスワードの判定はサービス内の一覧で行い、外部へ送らない。メールにパスワードや端末の情報を含めない。ログは許可リストの項目のみ |
| IV. データの保全と可搬性 | PASS | 既存の行は変えない追加のみのマイグレーションで、既存の利用者のログインを変えない。マイグレーションのテスト(`schema.test.ts`)を更新する。エクスポートの形式は変えない(パスワードを含めない) |
| V. TDD | PASS | サーバーの統合テスト、単体テスト、画面のテスト、E2E を先に書く。パスキーでの登録を前提とした既存のテストは、仕様の変更(004 FR-001、FR-002)により書き換え、理由を記録する(research.md §14) |
| VI. KISS・YAGNI | PASS | 依存を追加しない。パスキーでの登録の経路を削除して分岐を減らす。pepper、2段階認証の任意設定、パスワードの削除は入れない |
| VII. DRY | PASS | パスワードの長さの規則は `passwordSchema`(shared)、ハッシュは `auth/password.ts`、端末の確認は `auth/trusted-device.ts`、本人確認の画面の部品は1つ(`StepUpDialog`)にまとめる |
| VIII. 明示的なエラー処理 | PASS | 認証の失敗は同じ 401 で返すが、エラーを隠すのではなく、ID の列挙を防ぐ仕様(FR-005)である。メールの送信の失敗は 502 で示す(登録、端末の確認)。通知の失敗は既存の方針どおりログに記録する |
| Web プラットフォーム要件 | PASS | パスキー非対応の環境でも全機能を使える。入力欄はラベル、`autocomplete`、表示の切り替えを持ち、キーボードで操作できる |
| 開発ワークフロー(ADR) | PASS | ADR-0008(パスワードの導入、scrypt、端末の確認、よく使われるパスワードの一覧の出典とライセンス)を記録し、ADR-0003 の「パスワードを扱わない」前提を置き換える。ADR-0003 は書き換えず、Status を「ADR-0008 で一部置き換え」にする |

**憲章からの逸脱**: なし。001 の仕様(FR-002)とは反対の方針になるが、これは憲章ではなく仕様の変更で、004 の spec で置き換えを明記した。

**再確認(Phase 1 の設計後)**: すべて PASS。Complexity Tracking は不要。

## Project Structure

### Documentation (this feature)

```text
specs/004-id-password-login/
├── plan.md              # この計画
├── research.md          # Phase 0: 現状、ハッシュ、条件、列挙の防止、端末の確認、各フロー、脅威
├── data-model.md        # Phase 1: users の列、trusted_devices、列挙型、検証の規則
├── quickstart.md        # Phase 1: 動作確認の手順
├── contracts/
│   └── auth-api.md      # Phase 1: 認証 API と Cookie とメールの変更
└── tasks.md             # Phase 2(/speckit-tasks で作成)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas.ts                      # passwordSchema を追加
└── api.ts                          # Me に hasPassword、passwordChangedAt を追加

apps/server/
├── drizzle/0001_*.sql              # 新規: マイグレーション(drizzle-kit generate)
├── src/
│   ├── platform/
│   │   ├── db/schema.ts            # users の列、trusted_devices、列挙型の値
│   │   ├── mail.ts                 # OTP new_device、通知 new_device_login、password_set、password_changed。recovered の文言
│   │   ├── errors.ts               # step-up-required の文言
│   │   └── cleanup.ts              # 期限切れの trusted_devices を削除
│   ├── auth/
│   │   ├── password.ts             # 新規: 正規化、条件の判定、scrypt のハッシュと比較、ダミーのハッシュ
│   │   ├── common-passwords.txt    # 新規: よく使われるパスワード(12文字以上。SecLists、MIT)
│   │   ├── trusted-device.ts       # 新規: 端末の確認の Cookie と DB
│   │   ├── session.ts              # scope device_check
│   │   ├── routes.ts               # 登録(パスワード)、パスワードでのログインと端末の確認、復旧の選択、パスワードの step-up
│   │   └── account-security.ts     # PUT /me/password、最後のパスキーの削除の条件、メール変更の通知
│   └── profile/account.ts          # /me に hasPassword、passwordChangedAt
└── tests/
    ├── unit/password.test.ts       # 新規
    └── integration/
        ├── registration.test.ts    # パスワードでの登録に書き換え
        ├── login.test.ts           # パスワード、端末の確認、列挙の防止、パスキー(既存)
        ├── recovery.test.ts        # パスワードの再設定とパスキー
        ├── password.test.ts        # 新規: 設定、変更、通知、失効
        ├── passkeys.test.ts        # 最後のパスキーの削除の条件
        ├── email-change.test.ts    # パスワードでの step-up、両方への通知
        ├── account-delete.test.ts  # パスワードでの step-up、trusted_devices の削除
        ├── log-safety.test.ts      # パスワードがログに出ない
        ├── cleanup.test.ts         # 期限切れの trusted_devices
        └── schema.test.ts          # マイグレーション

apps/web/src/
├── features/auth/
│   ├── LoginPage.tsx               # パスワードの欄が既定。パスキーのボタン。端末の確認の OTP
│   ├── SignupPage.tsx              # メールの確認の後にパスワード
│   ├── RecoveryPage.tsx            # パスワードの再設定かパスキーの登録
│   ├── SecuritySettings.tsx        # パスワードの設定と変更、パスキーの削除の条件
│   ├── StepUpDialog.tsx            # 新規: パスワードまたはパスキーでの本人確認の共通の部品
│   ├── PasswordInput.tsx           # 新規: 表示の切り替え付きの入力欄
│   └── Unsupported.tsx             # パスキーのボタンの横に出す表示に変更
└── features/profile/ProfilePage.tsx # 退会の本人確認を StepUpDialog に

apps/web/tests/                      # auth.test.tsx、security-settings.test.tsx、profile.test.tsx を更新
e2e/auth.spec.ts                     # パスワードの登録、ログイン、端末の確認(全ブラウザ)、パスキー(Chromium)
e2e/helpers/seed-session.ts          # seedUser にパスワードの指定を追加

docs/adr/0008-password-login-and-trusted-devices.md  # 新規
docs/adr/0003-authentication-and-recovery.md         # Status のみ「ADR-0008 で一部置き換え」
specs/001-picture-diary-service/spec.md              # 置き換えた FR に「004 で置き換え」と注記
```

**Structure Decision**: 既存の npm workspaces の構成のまま。認証のコードは `apps/server/src/auth/` に、画面は `apps/web/src/features/auth/` に追加する。

## Complexity Tracking

違反がないため、記載なし。
