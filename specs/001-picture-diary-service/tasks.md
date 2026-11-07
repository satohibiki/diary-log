---

description: "絵日記公開サービスの実装タスク"
---

# Tasks: 絵日記公開サービス

**Input**: Design documents from `/specs/001-picture-diary-service/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/openapi.yaml、quickstart.md

**Tests**: 憲章の原則 V により TDD が必須である。テストのタスクは実装より先に行い、失敗を確認してから実装に進む。

**Organization**: タスクはユーザーストーリーごとにまとめ、各ストーリーを独立してテストできるようにする。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行して実行できる(別ファイルで、未完了のタスクに依存しない)
- **[Story]**: 対応するユーザーストーリー(US1〜US5)
- 説明には正確なファイルパスを含める

## Path Conventions

- **API**: `apps/server/src/`、テストは `apps/server/tests/`
- **画面**: `apps/web/src/`、テストは `apps/web/tests/`
- **共有**: `packages/shared/src/`、テストは `packages/shared/tests/`
- **E2E**: `e2e/`

## 全タスク共通のルール

- API は `specs/001-picture-diary-service/contracts/openapi.yaml` に、エラーは RFC 9457 の problem+json に従う。
- 権限のない対象と存在しない対象には、同じ404を返す。
- エラーを既定値や空の結果で隠さず、画面に失敗として表示する(憲章の原則 VIII)。
- 日記の内容、メールアドレス、認証情報をログやエラーに含めない(憲章の原則 III)。
- 日記を含む応答には `Cache-Control: no-store` を設定する。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: プロジェクトの初期化と品質ゲートの準備

- [ ] T001 npm workspaces(`apps/*`、`packages/*`)、Node.js 26 の `engines`、`.nvmrc`、`.gitignore`(`.env` と `.certs/` を含む)、`.env.example` を package.json などのルートファイルに作成する
- [ ] T002 TypeScript strict の共通設定を tsconfig.base.json に作成し、typescript-eslint が対応する TypeScript の最新版を選定する
- [ ] T003 [P] ワークスペースの package.json と tsconfig.json を packages/shared/package.json に作成する
- [ ] T004 [P] Hono、@hono/node-server、Zod、Drizzle ORM、pg、SimpleWebAuthn、sharp、Nodemailer、fflate を含む設定を apps/server/package.json に作成する
- [ ] T005 [P] React、React Router、SimpleWebAuthn、fflate、Vite を含む設定を apps/web/package.json に作成する
- [ ] T006 [P] 型情報付きルール、`react/no-danger`、未処理の Promise と空の catch の禁止を含む ESLint の設定を eslint.config.js に作成する
- [ ] T007 [P] Vitest の設定を vitest.workspace.ts に作成する
- [ ] T008 [P] Chromium、Firefox、WebKit、および幅360pxのプロジェクトを含む Playwright の設定を playwright.config.ts に作成する
- [ ] T009 [P] 開発用の PostgreSQL 18 とメール確認ツールを compose.yaml に定義する
- [ ] T010 [P] mkcert でローカル証明書を `.certs/` に生成する処理を scripts/dev-certs.sh に作成し、Vite の HTTPS と `/api` のプロキシを apps/web/vite.config.ts に設定する
- [ ] T011 `test`、`lint`、`typecheck`、`audit`、`secrets`、`verify`、`verify:encryption`、`test:e2e`、`dev`、`db:migrate` のスクリプトを package.json に追加する
- [ ] T012 [P] `npm run verify` を実行する pre-push フックを .githooks/pre-push に作成し、`prepare` で `core.hooksPath` を設定する
- [ ] T013 [P] PostgreSQL のサービスと mkcert の証明書を用意して verify と E2E を実行する GitHub Actions を .github/workflows/ci.yml に作成する
- [ ] T014 [P] secretlint の設定を .secretlintrc.json に作成し、`npm run secrets` で追跡中の全ファイルを検査して `verify` に含める

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: すべてのユーザーストーリーの前提となる基盤

**⚠️ CRITICAL**: このフェーズが完了するまで、ユーザーストーリーの作業を開始しない

### 共有の検証スキーマ

- [ ] T015 [P] ID(`^[a-z0-9_]{3,20}$`、予約語を除く)、ニックネーム(1〜20文字、書記素単位)、本文(1〜400文字、書記素単位)、天気(`sunny`、`cloudy`、`rainy`、`snowy`)、ワンタイムパスワード(`^\d{8}$`)、メールアドレス(最大254文字)の失敗するテストを packages/shared/tests/schemas.test.ts に作成する
- [ ] T016 上記のテストを満たす Zod スキーマを packages/shared/src/schemas.ts に実装する

### サーバーの基盤

- [ ] T017 [P] 必須の環境変数の欠落や `DATA_ENCRYPTION_KEYS` の形式の不正で起動に失敗する、失敗するテストを apps/server/tests/unit/config.test.ts に作成する
- [ ] T018 代替値なしで検証する設定の読み込みを apps/server/src/platform/config.ts に実装する。暗号鍵は `DATA_ENCRYPTION_KEYS`(バージョンと鍵の組)と `ACTIVE_KEY_VERSION` で渡す
- [ ] T019 [P] 許可していないフィールドが出力されない、失敗するテストを apps/server/tests/unit/logger.test.ts に作成する
- [ ] T020 許可リスト方式の JSON ロガーを標準出力へ書き込む形で apps/server/src/platform/logger.ts に実装する
- [ ] T021 [P] 復号の往復、AAD の不一致の拒否、改ざんの検出、古い `key_version` の復号の失敗するテストを apps/server/tests/unit/crypto.test.ts に作成する
- [ ] T022 AES-256-GCM の `encrypt` と `decrypt`(AAD はレコードの種別と ID)を apps/server/src/platform/crypto.ts に実装する
- [ ] T023 [P] 8桁の生成、HMAC-SHA-256 の検証、定数時間の比較の失敗するテストを apps/server/tests/unit/secrets.test.ts に作成する
- [ ] T024 ワンタイムパスワード、トークンのハッシュ、回数制限のバケットの HMAC を apps/server/src/platform/secrets.ts に実装する
- [ ] T025 実 PostgreSQL に接続し、テストごとにデータを隔離するヘルパーを apps/server/tests/helpers/db.ts に作成する
- [ ] T026 `node:crypto` の ES256 で登録と認証の応答を生成するソフトウェア認証器を apps/server/tests/helpers/software-authenticator.ts に作成する
- [ ] T027 ユーザーとログイン済みセッションを作成するヘルパーを apps/server/tests/helpers/users.ts に作成する
- [ ] T028 次の制約を確認する、失敗する統合テストを apps/server/tests/integration/schema.test.ts に作成する: `(user_id, diary_date)` の一意性、`follower_id <> followee_id`、`users` 削除時の CASCADE、`credential_id` の一意性
- [ ] T029 data-model.md の全テーブル(users、passkeys、sessions、webauthn_challenges、pending_registrations、email_otps、diaries、follows、blocks、rate_limits)を apps/server/src/platform/db/schema.ts に定義する。`visibility` の初期値は `private`、`status` は `pending` または `approved`、`scope` は `full` または `recovery`
- [ ] T030 DB クライアントを apps/server/src/platform/db/client.ts に実装し、初回のマイグレーションを apps/server/drizzle/ に生成する
- [ ] T031 [P] problem+json の形式と、内部エラーの詳細が漏れないことの失敗するテストを apps/server/tests/unit/errors.test.ts に作成する
- [ ] T032 エラークラスと共通のエラーハンドラーを apps/server/src/platform/errors.ts に実装する
- [ ] T033 [P] 上限の到達、ウィンドウの更新、再起動後の維持の失敗する統合テストを apps/server/tests/integration/rate-limit.test.ts に作成する
- [ ] T034 research.md の上限値に従う固定ウィンドウの回数制限を apps/server/src/platform/rate-limit.ts に実装する
- [ ] T035 [P] CSP(`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`)、HSTS、`nosniff`、`Referrer-Policy: no-referrer` の失敗するテストを apps/server/tests/integration/security-headers.test.ts に作成する
- [ ] T036 セキュリティヘッダーと `Origin` の検証のミドルウェアを apps/server/src/platform/security.ts に実装する
- [ ] T037 [P] 有効、期限切れ、`recovery` スコープの制限、失効の失敗する統合テストを apps/server/tests/integration/session.test.ts に作成する
- [ ] T038 セッションの作成、検証、失効を apps/server/src/auth/session.ts に実装する。Cookie は `__Host-session`、`HttpOnly`、`Secure`、`SameSite=Strict`。`full` は30日、`recovery` は10分
- [ ] T039 認証必須、`full` 必須、再認証必須のミドルウェアを apps/server/src/auth/middleware.ts に実装する
- [ ] T040 [P] `canViewDiaries` の全組み合わせ(本人、未ログイン、`private`、未フォロー、`pending`、`approved`、両方向のブロック)の失敗する統合テストを apps/server/tests/integration/view-policy.test.ts に作成する
- [ ] T041 data-model.md のルールを SQL の述語 `viewableOwnerCondition(viewerId)` として apps/server/src/social/view-policy.ts に1箇所で定義し、`canViewDiaries` もこの述語で判定する
- [ ] T042 [P] 形式の拒否、10MB の超過、偽装ファイル、5,000万ピクセルの超過、位置情報の除去、長辺の縮小の失敗するテストを apps/server/tests/unit/images.test.ts に作成する
- [ ] T043 sharp による WebP への再エンコード(絵日記は長辺1600px、プロフィール画像は400px)を apps/server/src/platform/images.ts に実装する
- [ ] T044 [P] 送信内容に日記の内容が含まれず、送信の失敗が例外になることの失敗するテストを apps/server/tests/unit/mail.test.ts に作成する
- [ ] T045 SMTP によるメール送信を apps/server/src/platform/mail.ts に実装する
- [ ] T046 [P] 期限切れデータの削除の失敗する統合テストを apps/server/tests/integration/cleanup.test.ts に作成する
- [ ] T047 1時間ごとの期限切れデータの削除を apps/server/src/platform/cleanup.ts に実装する
- [ ] T048 [P] 未知の `/api/*` が problem+json の404を返し、それ以外のパスが `index.html` を返し、全応答にセキュリティヘッダーが付く、失敗する統合テストを apps/server/tests/integration/app.test.ts に作成する
- [ ] T049 ミドルウェアとルートを組み立てる Hono アプリを apps/server/src/app.ts に、SPA の静的配信を含む起動処理を apps/server/src/server.ts に実装する

### 画面の基盤

- [ ] T050 [P] problem+json をエラーとして扱い、401でログインへ誘導する、失敗するテストを apps/web/tests/api-client.test.ts に作成する
- [ ] T051 API クライアントを apps/web/src/lib/api-client.ts に実装する
- [ ] T052 [P] エラー表示と認証ガードの失敗するテストを apps/web/tests/app-shell.test.tsx に作成する
- [ ] T053 ルーター、共通レイアウト、エラー表示、認証ガードを apps/web/src/app.tsx と apps/web/src/components/ に実装する
- [ ] T054 仮想認証器とテスト用メールの取得のヘルパーを e2e/helpers/auth.ts に作成する
- [ ] T055 テスト用 DB に `sessions` の行を直接作成し、`__Host-session` を Playwright の `storageState` に設定するヘルパーを e2e/helpers/seed-session.ts に作成する。アプリのコードにテスト用の認証経路を追加してはならない

**Checkpoint**: 基盤が完成し、ユーザーストーリーの実装を開始できる

---

## Phase 3: User Story 1 - パスキーで登録してログインする (Priority: P1) 🎯 MVP

**Goal**: パスワードなしで登録、ログイン、ログアウト、復旧ができる

**Independent Test**: 新しい ID でアカウントを作成し、ログアウト後にパスキーで再度ログインできること、およびワンタイムパスワードで新しいパスキーを登録できることを確認する

### Tests for User Story 1 ⚠️

> **NOTE: 先にテストを書き、失敗を確認してから実装する**

- [ ] T056 [P] [US1] `/auth/registration/*` の統合テストを apps/server/tests/integration/registration.test.ts に作成する(ID の重複は409、メール送信の失敗はエラー、未確認のメールではパスキーを登録できない、`/auth/registration/resend` で再送できる)
- [ ] T057 [P] [US1] `/auth/login/*` と `/auth/logout` の統合テストを apps/server/tests/integration/login.test.ts に作成する(存在しない ID と不一致の応答が同じ、パスワードの入力項目がない、IP と ID の組み合わせによる回数制限、別の IP からの失敗で本人のログインが妨げられない)
- [ ] T058 [P] [US1] `/auth/recovery/*` の統合テストを apps/server/tests/integration/recovery.test.ts に作成する(ID の有無で応答が同じ、有効期限10分、1回限り、試行5回まで、有効なワンタイムパスワードは同時に3件までで超過時は最も古いものが無効、`recovery` スコープでは絵日記へアクセスできない、完了時に他のセッションが失効し通知が届く)
- [ ] T059 [P] [US1] `/auth/step-up/*` と `/me/passkeys*` の統合テストを apps/server/tests/integration/passkeys.test.ts に作成する(最後の1件は409、追加時に通知)
- [ ] T060 [P] [US1] `/me/email-change/*` の統合テストを apps/server/tests/integration/email-change.test.ts に作成する(再認証が必要、変更前の宛先へ通知)
- [ ] T061 [P] [US1] メールアドレスが本人以外の応答に含まれず、DB に平文で保存されないことの統合テストを apps/server/tests/integration/email-privacy.test.ts に作成する
- [ ] T062 [P] [US1] 登録、ログアウト、ログイン、復旧の E2E を e2e/auth.spec.ts に作成する
- [ ] T063 [P] [US1] 登録、ログイン、復旧の画面の失敗するテストを apps/web/tests/auth.test.tsx に作成する(パスワードの入力欄がない、パスキー非対応の環境では非対応を表示する)
- [ ] T064 [P] [US1] `GET /me` の統合テストを apps/server/tests/integration/me.test.ts に作成する(未ログインは401、`recovery` スコープは拒否、本人のメールアドレスのみ返す)

### Implementation for User Story 1

- [ ] T065 [US1] ワンタイムパスワードの発行、検証、再送を apps/server/src/auth/otp.ts に実装する(有効期限10分、1回限り、試行5回まで、8桁、同時に有効なものは3件まで、失敗は有効な全件に加算)
- [ ] T066 [US1] WebAuthn の設定とチャレンジの管理を apps/server/src/auth/webauthn.ts に実装する(Discoverable Credential と User Verification を必須、チャレンジは5分で1回限り、ログインの `allowCredentials` は空)
- [ ] T067 [US1] 登録のエンドポイントを apps/server/src/auth/registration.ts に実装する(`pending_registrations` は1時間で失効、登録時に ID の一意性を再確認、確定時に `email_enc` を `users` の AAD で再暗号化、再送を含む)
- [ ] T068 [US1] ログインとログアウトのエンドポイントを apps/server/src/auth/login.ts に実装する
- [ ] T069 [US1] 復旧のエンドポイントを apps/server/src/auth/recovery.ts に実装する(メール送信は応答を待たない)
- [ ] T070 [US1] 再認証のエンドポイントを apps/server/src/auth/step-up.ts に実装する(有効期間5分)
- [ ] T071 [US1] パスキーの一覧、追加、削除を apps/server/src/auth/passkeys.ts に実装する(`name` は最大50文字)
- [ ] T072 [US1] メールアドレスの変更を apps/server/src/auth/email-change.ts に実装する(確定時に `new_email_enc` を `users` の AAD で再暗号化)
- [ ] T073 [US1] `GET /me` を apps/server/src/profile/routes.ts に実装する
- [ ] T074 [US1] 登録、ログイン、復旧の画面を apps/web/src/features/auth/ に実装する
- [ ] T075 [US1] パスキーとメールアドレスの管理画面を apps/web/src/features/auth/SecuritySettings.tsx に実装する

**Checkpoint**: User Story 1 が単独で動作し、テストできる

---

## Phase 4: User Story 2 - 縦書きで絵日記を書く (Priority: P1)

**Goal**: 画像、縦書きの文章、日付、天気からなる絵日記を作成、閲覧、編集、削除できる

**Independent Test**: ログイン後に画像、文章、日付、天気を入力して保存し、同じ内容が縦書きの絵日記として表示され、編集と削除もできることを確認する

### Tests for User Story 2 ⚠️

> **NOTE: 先にテストを書き、失敗を確認してから実装する**

- [ ] T076 [P] [US2] `POST /me/diaries` と `GET /users/{handle}/diaries/{date}` の統合テストを apps/server/tests/integration/diary-create.test.ts に作成する(4項目が必須、同じ日付は409、UTC+14 の当日より後は拒否、暗号化されて保存される、応答が `Cache-Control: no-store`)
- [ ] T077 [P] [US2] `PUT` と `DELETE /me/diaries/{date}` の統合テストを apps/server/tests/integration/diary-update.test.ts に作成する(本人以外は404、画像なしの更新は既存の画像を維持)
- [ ] T078 [P] [US2] 画像の配信の統合テストを apps/server/tests/integration/diary-image.test.ts に作成する(`no-store`、`nosniff`、権限なしは404、位置情報が残らない)
- [ ] T079 [P] [US2] 下書きの保存、復元、消去の失敗するテストを apps/web/tests/draft-store.test.ts に作成する
- [ ] T080 [P] [US2] 記入画面と閲覧画面の失敗するテストを apps/web/tests/diary-editor.test.tsx に作成する(日付の初期値が当日、未来の日付を選べない、残り文字数の表示、不足項目の表示、保存失敗時に入力を保持、接続が切れた場合の表示、本文のマークアップが文字として表示される)
- [ ] T081 [P] [US2] 作成、編集、削除、タブを閉じた後の復元の E2E を e2e/diary.spec.ts に作成する
- [ ] T082 [P] [US2] 全ブラウザと幅360pxで、縦書きの表示と入力が横スクロールなしに動作する E2E を e2e/vertical-writing.spec.ts に作成する。ログインには e2e/helpers/seed-session.ts を使う

### Implementation for User Story 2

- [ ] T083 [US2] 暗号化を含む絵日記の保存と読み込みを apps/server/src/diaries/repository.ts に実装する(`{ body, weather }` を `content_enc` に暗号化、一覧では `image_enc` を読み込まない)
- [ ] T084 [US2] 絵日記の作成、編集、削除を apps/server/src/diaries/service.ts に実装する
- [ ] T085 [US2] 絵日記のエンドポイントと画像の配信を apps/server/src/diaries/routes.ts に実装する(閲覧は `canViewDiaries` を経由)
- [ ] T086 [US2] IndexedDB の下書きの保持を apps/web/src/lib/draft-store.ts に実装する(利用者ごとに1件、入力後500msで書き込み、保存の完了時とログアウト時に消去)
- [ ] T087 [US2] 縦書きの表示部品を apps/web/src/components/VerticalPage.tsx に実装する(`writing-mode: vertical-rl`、原稿用紙風の枠)
- [ ] T088 [US2] 記入画面を apps/web/src/features/diary/DiaryEditor.tsx に実装する
- [ ] T089 [US2] 閲覧、編集、削除の確認の画面を apps/web/src/features/diary/DiaryView.tsx に実装する
- [ ] T090 [US2] ログアウト処理に下書きの消去を組み込み、apps/web/src/features/auth/ を更新する

**Checkpoint**: User Story 1 と 2 が動作し、個人の絵日記として利用できる

---

## Phase 5: User Story 3 - カレンダーで過去の絵日記を探す (Priority: P2)

**Goal**: 月単位のカレンダーで過去の絵日記を探して読める

**Independent Test**: 複数の日付の絵日記を用意し、カレンダーで該当月へ移動して、日付を選ぶと絵日記が開くことを確認する

### Tests for User Story 3 ⚠️

> **NOTE: 先にテストを書き、失敗を確認してから実装する**

- [ ] T091 [P] [US3] `GET /me/diaries?month=` の統合テストを apps/server/tests/integration/calendar.test.ts に作成する(月の境界、他人の日記を含まない、不正な形式は422)
- [ ] T092 [P] [US3] カレンダーの失敗するテストを apps/web/tests/calendar.test.tsx に作成する(日付の識別、月の移動、絵日記のない日付から作成、未来の日付は選べない、キーボード操作)
- [ ] T093 [P] [US3] カレンダーから絵日記を開く E2E を e2e/calendar.spec.ts に作成する

### Implementation for User Story 3

- [ ] T094 [US3] 月別の日付の取得を apps/server/src/diaries/routes.ts に実装する
- [ ] T095 [US3] カレンダーの画面を apps/web/src/features/calendar/CalendarPage.tsx に実装する

**Checkpoint**: 過去の絵日記をカレンダーから探せる

---

## Phase 6: User Story 4 - プロフィールと公開設定を管理する (Priority: P2)

**Goal**: ニックネーム、プロフィール画像、公開設定、エクスポート、退会を管理できる

**Independent Test**: ニックネームと画像を設定し、承認済みのフォロー関係をテストデータで用意した別のアカウントから、公開設定の切り替えどおりに見え方が変わることを確認する

### Tests for User Story 4 ⚠️

> **NOTE: 先にテストを書き、失敗を確認してから実装する**

- [ ] T096 [P] [US4] `PATCH /me` の統合テストを apps/server/tests/integration/profile.test.ts に作成する(初期値は `private`、ニックネームは1〜20文字、入力項目はニックネームと公開設定のみ)
- [ ] T097 [P] [US4] `PUT` と `DELETE /me/avatar`、`GET /users/{handle}/avatar` の統合テストを apps/server/tests/integration/avatar.test.ts に作成する(形式とサイズの制限、400px への縮小、暗号化保存)
- [ ] T098 [P] [US4] `DELETE /me` の統合テストを apps/server/tests/integration/account-delete.test.ts に作成する(再認証が必要、全データの削除、他の利用者に表示されない)
- [ ] T099 [P] [US4] `GET /me/export` の統合テストを apps/server/tests/integration/export.test.ts に作成する(`manifest.json` の `schemaVersion: 1`、全件と画像を含む、本人のみ)
- [ ] T100 [P] [US4] インポートの失敗するテストを apps/web/tests/import.test.ts に作成する(同じ日付は上書きせずスキップ、成功、スキップ、失敗の件数の表示、不正な ZIP の拒否)
- [ ] T101 [P] [US4] プロフィール画面の失敗するテストを apps/web/tests/profile.test.tsx に作成する(公開への切り替え時の確認、過去の絵日記も対象になる説明、退会の確認、ニックネームのマークアップが文字として表示される)
- [ ] T102 [P] [US4] 公開設定とエクスポート、インポートの E2E を e2e/profile.spec.ts に作成する。フォロー関係はテストデータで用意する

### Implementation for User Story 4

- [ ] T103 [US4] ニックネームと公開設定の更新を apps/server/src/profile/routes.ts に実装する
- [ ] T104 [US4] プロフィール画像のエンドポイントを apps/server/src/profile/avatar.ts に実装する
- [ ] T105 [US4] 退会を apps/server/src/profile/account.ts に実装する
- [ ] T106 [US4] ZIP のストリーミングによるエクスポートを apps/server/src/diaries/export.ts に実装する
- [ ] T107 [US4] エクスポート形式の公開仕様を docs/export-format.md に記載する
- [ ] T108 [US4] ブラウザでの ZIP の展開と、作成 API によるインポートを apps/web/src/features/profile/import.ts に実装する
- [ ] T109 [US4] プロフィール画面を apps/web/src/features/profile/ProfilePage.tsx に実装する

**Checkpoint**: 利用者がプロフィールと公開範囲を自分で管理できる

---

## Phase 7: User Story 5 - フォローしているユーザーの絵日記を読む (Priority: P3)

**Goal**: 承認制のフォローで、フォロー中のユーザーの絵日記を読める

**Independent Test**: 2つのアカウントを用意し、一方がもう一方を ID で検索してフォローを申請し、相手の承認後に、公開中の絵日記が一覧に表示されることを確認する

### Tests for User Story 5 ⚠️

> **NOTE: 先にテストを書き、失敗を確認してから実装する**

- [ ] T110 [P] [US5] `GET /users/{handle}` の統合テストを apps/server/tests/integration/user-search.test.ts に作成する(完全一致のみ、ブロック時は404、応答にメールアドレスと公開設定を含まない、回数制限)
- [ ] T111 [P] [US5] フォロー、承認、拒否、取り消し、解除の統合テストを apps/server/tests/integration/follows.test.ts に作成する(状態遷移は data-model.md のとおり、承認前は閲覧できない)
- [ ] T112 [P] [US5] ブロックの統合テストを apps/server/tests/integration/blocks.test.ts に作成する(両方向の `follows` の削除、以後の申請は404、解除)
- [ ] T113 [P] [US5] `GET /feed` と `GET /users/{handle}/diaries` の統合テストを apps/server/tests/integration/feed.test.ts に作成する(日付の新しい順、カーソル、`limit` は1〜50、非公開化とブロックが5秒以内に反映、応答が `Cache-Control: no-store`、T040 の全組み合わせで一覧の結果と `canViewDiaries` が一致)
- [ ] T114 [P] [US5] 一覧とフォロー管理の画面の失敗するテストを apps/web/tests/social.test.tsx に作成する
- [ ] T115 [P] [US5] 申請、承認、一覧、非公開化、直接の URL、ブロックの E2E を e2e/social.spec.ts に作成する

### Implementation for User Story 5

- [ ] T116 [US5] ユーザーの検索とアバターの閲覧条件を apps/server/src/social/users.ts に実装する
- [ ] T117 [US5] フォローの申請、承認、拒否、取り消し、解除、一覧を apps/server/src/social/follows.ts に実装する
- [ ] T118 [US5] ブロックを apps/server/src/social/blocks.ts に実装する(`follows` の削除と同じトランザクション)
- [ ] T119 [US5] フィードとユーザーの絵日記の一覧を apps/server/src/social/feed.ts に実装する(`viewableOwnerCondition` を使用し、閲覧条件を再定義してはならない)
- [ ] T120 [US5] 一覧の画面を apps/web/src/features/social/FeedPage.tsx に実装する
- [ ] T121 [US5] ユーザーページを apps/web/src/features/social/UserPage.tsx に実装する
- [ ] T122 [US5] 検索、申請、フォロワー、ブロックの管理画面を apps/web/src/features/social/ConnectionsPage.tsx に実装する

**Checkpoint**: すべてのユーザーストーリーが動作する

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 複数のストーリーにまたがる確認と仕上げ

- [ ] T123 [P] DB のダンプに本文とメールアドレスの平文が含まれないことを確認する `verify:encryption` を scripts/verify-encryption.ts に作成する
- [ ] T124 [P] ログに日記の内容、メールアドレス、ワンタイムパスワードが出力されないことの統合テストを apps/server/tests/integration/log-safety.test.ts に作成する
- [ ] T125 [P] 主要画面のキーボード操作と自動アクセシビリティ検査の E2E を e2e/accessibility.spec.ts に作成する
- [ ] T126 [P] SC-003、SC-005、SC-008 の性能を確認するテストを e2e/performance.spec.ts に作成する
- [ ] T127 [P] 運営者がデータを読める可能性、バックアップの保持期間、メールの利用目的の説明と、登録画面からの導線の失敗するテストを apps/web/tests/privacy.test.tsx に作成し、説明画面を apps/web/src/features/legal/PrivacyPage.tsx に実装する
- [ ] T128 [P] 運営者のアクセスの方針(閲覧機能を設けない、DB と鍵の権限の分離、監査ログ)を docs/adr/0005-operator-access.md に記録する
- [ ] T129 [P] 本番用のマルチステージビルドを Dockerfile に作成する
- [ ] T130 セットアップと運用の手順、および暗号鍵のバックアップを README.md に記載する
- [ ] T131 実装結果に合わせて docs/adr/0001-application-architecture.md から 0004 までを確認し、採択または新しい ADR で更新する
- [ ] T132 Firefox と Safari でパスキーの登録とログインを手動で確認し、結果を specs/001-picture-diary-service/quickstart.md に記録する
- [ ] T133 specs/001-picture-diary-service/quickstart.md の検証シナリオ15件をすべて実行する

---

## Phase 9: Deployment Readiness

**Purpose**: 一般公開の必須条件を確認する。すべて完了するまで公開しない

- [ ] T134 TLS、監査ログ、自動バックアップ、鍵の秘匿を条件にホスティング先を選定し、docs/adr/0006-hosting.md に記録する
- [ ] T135 メール配信事業者を選定し、メールアドレスが事業者に渡ることを含めて docs/adr/0007-mail-delivery.md に記録する
- [ ] T136 本番 DB と暗号鍵へのアクセスが個別の権限に限定され、監査ログに記録されることを確認し、結果を docs/operations/production-access.md に記録する
- [ ] T137 バックアップの保持が最長30日であること、暗号鍵のバックアップ、および復元の手順を確認し、結果を docs/operations/backup.md に記録する
- [ ] T138 本番で HTTP が HTTPS へ転送され、HSTS と CSP が有効で、`__Host-session` が設定されることを確認し、結果を docs/operations/release-checklist.md に記録する

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし
- **Foundational (Phase 2)**: Setup に依存し、すべてのユーザーストーリーをブロックする
- **User Stories (Phase 3〜7)**: Foundational に依存する
- **Polish (Phase 8)**: 必要なユーザーストーリーの完了に依存する
- **Deployment Readiness (Phase 9)**: Polish に依存し、一般公開をブロックする

### User Story Dependencies

- **US1 (P1)**: Foundational の完了後に開始できる
- **US2 (P1)**: US1 に依存する(ログインが必要)
- **US3 (P2)**: US2 に依存する(絵日記が必要)
- **US4 (P2)**: US2 に依存する。退会とエクスポートは US1 の再認証も使う
- **US5 (P3)**: US2 と US4 に依存する(公開設定が必要)

```text
Setup → Foundational → US1 → US2 ┬→ US3
                                 └→ US4 → US5 → Polish → Deployment Readiness
```

### Within Each User Story

- テストを書き、失敗を確認してから実装する(憲章の原則 V)
- データの保存 → サービス → エンドポイント → 画面の順に進める
- ストーリーの完了を確認してから次へ進む

### Parallel Opportunities

- Setup と Foundational の `[P]` のタスクは同時に実行できる
- 各ストーリーのテストのタスク(`[P]`)は同時に作成できる
- US2 の完了後は、US3 と US4 を並行して進められる
- 実装のタスクは同じファイルや先行する処理に依存するため、ストーリー内では順に進める

---

## Parallel Example: User Story 1

```bash
# User Story 1 のテストをまとめて作成する:
Task: "apps/server/tests/integration/registration.test.ts を作成する"
Task: "apps/server/tests/integration/login.test.ts を作成する"
Task: "apps/server/tests/integration/recovery.test.ts を作成する"
Task: "e2e/auth.spec.ts を作成する"
```

## Parallel Example: User Story 2

```bash
Task: "apps/server/tests/integration/diary-create.test.ts を作成する"
Task: "apps/server/tests/integration/diary-update.test.ts を作成する"
Task: "apps/web/tests/draft-store.test.ts を作成する"
Task: "e2e/vertical-writing.spec.ts を作成する"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 と Phase 2 を完了する
2. US1 と US2 を完了する(US1 だけではサービスの価値が得られないため、MVP はこの2つとする)
3. **STOP and VALIDATE**: 個人の絵日記として動作することを確認する

### Incremental Delivery

1. Setup と Foundational → 基盤の完成
2. US1 と US2 → 個人の絵日記(MVP)
3. US3 → 過去の絵日記の検索
4. US4 → プロフィール、公開設定、エクスポート
5. US5 → 共有

一般公開は、Phase 9 の完了後に行う。

---

## Notes

- `[P]` は別ファイルで依存がないタスクを示す
- `[Story]` はタスクとユーザーストーリーの対応を示す
- 実装の前に、テストの失敗を必ず確認する
- タスクまたは論理的なまとまりごとにコミットする
- push の前に `npm run verify` を実行する
- 技術選定や設計を変更する場合は ADR を追加する
