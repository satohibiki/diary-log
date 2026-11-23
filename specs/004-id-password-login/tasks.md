---

description: "Task list for 004-id-password-login"
---

# Tasks: ID とパスワードでのログイン(パスキーも利用可)

**Input**: Design documents from `/specs/004-id-password-login/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-api.md, quickstart.md

**Tests**: 憲章 V(TDD、NON-NEGOTIABLE)により、動きを変えるすべてのコードでテストを先に書き、失敗を確かめてから実装する。仕様の変更でテストを書き換える場合は、理由をテストのコメントに1行で残す。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## 共通の前提(すべてのタスク)

- サーバーの統合テストは実 DB を使う。`apps/server/tests/helpers/app.ts` の `buildTestContext`(`ctx.client()`、`ctx.outbox`、`lastOtp(ctx.outbox, email)`)、`helpers/db.ts` の `resetDb`、`helpers/users.ts` の `createUser`、`loginAs` を使う。クライアントの IP は `x-test-ip` ヘッダーで指定する。
- 応答のエラーは既存の problem 形式。認証の失敗は `errors.authenticationFailed()`(401 `authentication-failed`)、検証のエラーは `errors.validation(...)`(422、`errors[].field` と `code`)。
- 回数制限は `deps.rateLimiter.consume(bucket, key, limit, windowSeconds)`。
- 「パスワードの比較」は、T008 の `verifyPassword` を使う。
- 画面のテストは Vitest(jsdom)と `apps/web/tests/helpers.ts` の `mockFetch`。E2E は Playwright と `e2e/helpers/auth.ts` の `fetchOtp(email, since)`(Mailpit)。
- 単体テストは `npm test`、E2E は開発サーバーを `APP_ORIGIN=https://localhost:5173 RP_ID=localhost npm run dev` で起動してから `npx playwright test`。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 記録と、よく使われるパスワードの一覧の準備

- [X] T001 ADR を `docs/adr/0008-password-login-and-trusted-devices.md` に、`docs/adr/0007-per-date-drafts.md` と同じ形式(Status、Date、背景、決定、検討した代替案、影響)で書く。内容は research.md §1〜§5、§13。
  - 背景: パスキー非対応の端末で使えない(004 spec の概要)。ADR-0003 の「パスワードを扱わない」前提を置き換える。
  - 決定: scrypt(N=2^15、r=8、p=3、16バイトのソルト、32バイトの出力、保存形式 `scrypt$15$8$3$<salt>$<hash>`)、NFKC と 12〜128 文字、よく使われるパスワードの一覧(出典 SecLists `Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt`、MIT License)、ダミーのハッシュによる時間の均一化、`__Host-device` と `trusted_devices`(90日、全失効の条件)、`password_hash` を暗号化しない理由(復元できない形のため。憲章 II)。
  - 代替案: Argon2id、bcrypt、PBKDF2、pepper、端末の指紋、毎回の OTP。
- [X] T002 [P] `docs/adr/0003-authentication-and-recovery.md` の Status 行だけを「採用(ADR-0008 で一部置き換え: パスワードでのログインと端末の確認)」に変える。本文は書き換えない
- [X] T003 [P] `specs/001-picture-diary-service/spec.md` の FR-001、FR-002、FR-004、FR-005、FR-005b、FR-005e の各行の末尾に「(004-id-password-login で置き換え)」を、Edge Cases の「パスキーに対応していない環境では…」の行の末尾に「(004-id-password-login の FR-012 で置き換え)」を追記する
- [X] T004 [P] よく使われるパスワードの一覧を `apps/server/src/auth/common-passwords.txt` に作る。`scripts/build-common-passwords.ts`(新規、Node の標準機能のみ)で、SecLists の上記ファイル(開発者が手元にダウンロードしたものをパスで渡す)を読み、各行を NFKC で正規化して小文字にし、コードポイント数が12以上のものだけを重複なく出力する。ファイルの先頭に `# source: SecLists xato-net-10-million-passwords-1000000.txt (MIT License)` と `# filtered: NFKC, lowercase, >= 12 code points` の2行のコメントを置く(読み込み側は `#` で始まる行を無視する)。スクリプトの使い方をスクリプトの先頭のコメントに書く

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB、パスワードの処理、端末の確認、共有の型。すべてのストーリーがこれに依存する。

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests (先に書き、失敗を確かめる)

- [X] T005 [P] `passwordSchema` のテストを `packages/shared/tests/schemas.test.ts`に書き、失敗を確かめる。
  - 11コードポイントは `too_small`、12は成功、128は成功、129は `too_big`。
  - 全角の英数字(例: `ＡＢＣＤＥＦＧＨＩＪＫＬ`)は NFKC で半角になり、出力の値が半角になる。
  - 日本語と空白を含む12文字のパスフレーズを受け付ける。
  - 結合文字(例: `か` + U+3099)は NFKC で1文字(`が`)として数える。
- [X] T006 [P] パスワードの処理の単体テストを `apps/server/tests/unit/password.test.ts` に書き、失敗を確かめる(T008 の関数)。
  - `hashPassword(p)` が `scrypt$15$8$3$` で始まり、同じ入力でも毎回違う値になる(ソルト)。値にパスワードの文字列を含まない。
  - `verifyPassword(p, hash)` は正しければ `true`、違えば `false`。保存形式のパラメーター(例: `scrypt$14$8$1$…` で作ったハッシュ)を読み取って比較できる。形式が壊れた文字列ではエラーを投げる。
  - `verifyAgainstDummy(p)` は常に `false` を返し、`verifyPassword` と同じ scrypt の計算を1回行う(呼び出し回数を `vi.spyOn` で確かめられるよう、内部の scrypt を1つの関数にまとめる)。
  - `checkPasswordRules(password, handle)`: 一覧にある語(小文字化して一致。`PasswordPassword1` → 一覧に `passwordpassword1` があれば `common`)、ID を含む(`alice` に対し `my-ALICE-diary-2026` は `contains_handle`)、問題なければ空の配列。一覧の読み込みでは `#` で始まる行と空行を無視する。
- [X] T007 [P] スキーマのテストを `apps/server/tests/integration/schema.test.ts` に加え、失敗を確かめる。マイグレーションの後に次が成り立つ。
  - `users` に `password_hash`(text、NULL 可)と `password_changed_at`(timestamptz、NULL 可)があり、検査制約「`(password_hash IS NULL) = (password_changed_at IS NULL)`」に反する更新が失敗する。
  - `trusted_devices`(`user_id` uuid NOT NULL、`users.id` への外部キー on delete cascade、`token_hash` bytea NOT NULL、`last_used_at` timestamptz NOT NULL、`expires_at` timestamptz NOT NULL、`created_at` timestamptz NOT NULL 既定 now()、主キー `(user_id, token_hash)`、`expires_at` の索引)がある。ユーザーの削除で行が消える。
  - 列挙型 `session_scope` に `device_check`、`otp_purpose` に `new_device` がある。
  - 既存のユーザーの行(パスワードなし)がそのまま読める。

### Implementation

- [X] T008 `apps/server/src/auth/password.ts` を作り、T006 を通す(research.md §1〜§3)。
  - `hashPassword(password: string): Promise<string>`: 16バイトの乱数のソルト、`crypto.scrypt`(N=2^15、r=8、p=3、keylen 32、`maxmem` は 64MB)、保存形式 `scrypt$<log2 N>$<r>$<p>$<salt base64url>$<hash base64url>`。
  - `verifyPassword(password, stored): Promise<boolean>`: 保存形式を解析し、同じパラメーターで計算して `timingSafeEqual` で比べる。
  - `verifyAgainstDummy(password): Promise<false>`: モジュールの読み込み時に作る固定のダミーのハッシュと比べ、常に `false`。
  - `checkPasswordRules(password, handle): ('common' | 'contains_handle')[]`: 入力は `passwordSchema` で正規化済みとする。一覧は `common-passwords.txt` を最初の呼び出し時に `Set` に読み込む。
  - 入力のパスワードはどの関数でもログや例外のメッセージに含めない。
- [X] T009 [P] `packages/shared/src/schemas.ts` に `passwordSchema` を加え、T005 を通す。`z.string().transform((v) => v.normalize('NFKC'))` のあとでコードポイント数(`Array.from(v).length`)を 12〜128 で検査する。エラーのコードは `too_small` と `too_big`。`packages/shared/src/index.ts` から公開する
- [X] T010 [P] `packages/shared/src/api.ts` の `Me` に `hasPassword: boolean` と `passwordChangedAt: string | null` を加え、`apps/server/src/profile/account.ts`(`/me` の応答を作る箇所)で `users.passwordHash !== null` と `passwordChangedAt?.toISOString() ?? null` を返す。`apps/server/tests/integration/me.test.ts` に、パスワードなしのユーザーで `hasPassword: false`、`passwordChangedAt: null` になるテストを先に加えて失敗を確かめる。`apps/web/tests/helpers.ts` の `me` の固定値にも2項目を加える
- [X] T011 `apps/server/src/platform/db/schema.ts` に data-model.md のとおり列、表、列挙型の値を加え、`npm run db:generate -w @diary/server` で `apps/server/drizzle/0001_*.sql` を生成する。生成した SQL を読み、既存の行を変える文(列の NOT NULL 化、既存の値の更新、列挙型の作り直し)が無いことを確かめる。T007 を通す
- [X] T012 `apps/server/src/auth/trusted-device.ts` を作る(research.md §4、§5)。テストを先に `apps/server/tests/integration/trusted-device.test.ts` に書いて失敗を確かめる。
  - `DEVICE_COOKIE = '__Host-device'`、`TRUSTED_DAYS = 90`。
  - `isTrusted(deps, userId, token | undefined): Promise<boolean>`: トークンの SHA-256(`deps.secrets.hashToken`)と `userId` の行があり、`expires_at > now` なら `true`。
  - `trust(deps, userId, token | undefined): Promise<string>`: トークンが無ければ `deps.secrets.newToken()` で作る。行を upsert し、`last_used_at = now`、`expires_at = now + 90日` にする。トークンを返す。
  - `revokeAll(deps, userId)`: そのユーザーの全行を削除。
  - `deviceCookie(token)`: `__Host-device=<token>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7776000`。
  - テストで確かめる: 確認の前は `false`、`trust` の後は `true`、別のユーザーには `false`、90日と1秒後は `false`、`trust` の再実行で期限が延びる、`revokeAll` の後は `false`、同じトークンで2人のユーザーを確認できる。
- [X] T013 [P] `apps/server/src/platform/cleanup.ts` の `deleteExpired` に、`trusted_devices` の `expires_at < now` の行の削除を加える。`apps/server/tests/integration/cleanup.test.ts` にテストを先に加えて失敗を確かめる
- [X] T014 [P] `apps/server/src/auth/session.ts` の `Scope` に `'device_check'` を加え、`TTL_SECONDS.device_check = 10 * 60` にする。`apps/server/tests/helpers/users.ts` の `loginAs` の `scope` の型にも加える
- [X] T015 [P] `apps/server/src/platform/mail.ts` に、OTP の用途 `new_device`(件名「【diary-log】新しい端末からのログインの確認」)と、通知 `new_device_login`(「【diary-log】新しい端末からログインしました」)、`password_set`(「【diary-log】パスワードが設定されました」)、`password_changed`(「【diary-log】パスワードが変更されました」)を加え、`recovered` の本文を「パスワードの再設定または新しいパスキーの登録により、アカウントが復旧されました。\n心当たりがない場合は、すぐにアカウントを確認してください。」に変える。本文はどれも定型文で、パスワード、IP、端末の情報を含めない。`apps/server/tests/unit/mail.test.ts` にテストを先に加える。`apps/server/src/auth/otp.ts` の `OtpPurpose` と `routes.ts` の `notify` の `notice` の型にも値を加える
- [X] T016 [P] `apps/server/src/platform/errors.ts` の `stepUpRequired` の文言を「本人確認が必要です」に変える。この文言を確かめている既存のテストがあれば、理由(004 でパスワードでも本人確認できるようにした)をコメントに残して期待を直す
- [X] T017 テスト用の手順を `apps/server/tests/helpers/flows.ts` に用意する(後続のテストが使う)。
  - `registerUser(ctx, handle, email?, password = 'correct horse battery staple')` を、パスワードでの登録(contracts の登録の4本)に書き換え、`{ client, handle, email, password, userId }` を返す。`userId` は `/api/v1/me` の応答では得られないため、`users` 表を handle で引いて得る。
  - `createPasskeyUser(ctx, handle)`: 既存のパスキーだけの利用者を作る。`createUser` → `loginAs`(full) → `createSessionStore(ctx.deps).markStepUp(token)` → `/me/passkeys/options` と `/me/passkeys/finish` で `SoftwareAuthenticator` のパスキーを登録し、`{ client, authenticator, user }` を返す(パスキーでの登録の経路を削除したため。research.md §6)。
  - `stepUpWithPassword(client, password)`: `/auth/step-up/password` を呼び 204 を確かめる。
  - `loginWithPassword(ctx, handle, password, { ip?, deviceToken? })`: `/auth/login/password` を呼び、応答と、`Set-Cookie` から取り出した `__Host-device` のトークンを返す。`TestClient` が `__Host-device` も保持するよう、`apps/server/tests/helpers/app.ts` の Cookie の処理を確かめ、必要なら直す。

**Checkpoint**: パスワードを安全に保存、比較でき、端末の確認を記録できる。

---

## Phase 3: User Story 1 - ID とパスワードで登録してログインする (Priority: P1) 🎯 MVP

**Goal**: パスキーに対応していない端末でも、ID とパスワードで登録とログインができ、初めて使う端末ではメールの OTP で確認する。

**Independent Test**: パスキーに対応していないブラウザ(Firefox、WebKit)で、登録、ログアウト、パスワードでのログインができ、別のブラウザのコンテキストでは OTP を求められる。

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T018 [P] [US1] `apps/server/tests/integration/registration.test.ts` をパスワードでの登録に書き換え、失敗を確かめる。パスキーでの登録を前提としたテストは、仕様の変更(004 FR-001)により削除または書き換え、ファイルの先頭のコメントに理由を書く。確かめる内容:
  - `verify-email` が 204 を返し、本文にパスキーのオプションを含まない。
  - `finish { registrationId, password }` が 201 で、`__Host-session`(full)と `__Host-device` を設定し、`/me` が `hasPassword: true` を返す。`users.password_hash` が `scrypt$` で始まり、パスワードの文字列を含まない。
  - メール未確認の `registrationId` では 401。
  - 11文字は 422(`password`/`too_small`)、一覧の語は 422(`common`)、ID を含むものは 422(`contains_handle`)。
  - 登録の後、同じクライアント(同じ `__Host-device`)でのパスワードのログインは 204(US1-9)。
- [X] T019 [P] [US1] `apps/server/tests/integration/login.test.ts` に、パスワードでのログインのテストを加え、失敗を確かめる。既存のパスキーのログインのテストは、`createPasskeyUser` を使うよう書き換える(期待は変えない。SC-003)。
  - 確認済みの端末: 204、`/me` が 200。`trusted_devices` の `expires_at` が延びる。
  - 未確認の端末(Cookie なし): 202 `{ next: "verify-device" }`、`__Host-session` の scope が `device_check`、登録済みのアドレスへ OTP が送られる。この状態で `/me` は 401。
  - `/auth/login/device/verify { code }`: 正しい OTP で 204、full のセッションと `__Host-device` が設定され、`device_check` のセッションは失効し、`new_device_login` の通知が送られる。誤った OTP で 401。full のセッションなしでの呼び出しは 401。
  - `/auth/login/device/resend`: 202 で OTP が再送される。1時間に4回目で 429。
  - ID の列挙の防止(FR-005): 存在しない ID、パスワードを持たない ID(`createPasskeyUser`)、誤ったパスワードの3つの応答の status と本文が同一。3つとも scrypt の計算を1回ずつ行う(`password.ts` の内部の関数を `vi.spyOn` で数える)。
  - 回数制限: 同じ IP と ID で6回目は 429。
  - パスキーのログイン(既存の `login/verify`)は、未確認の端末でも OTP なしで 204(spec の Edge Cases)。
- [X] T020 [P] [US1] `apps/server/tests/integration/log-safety.test.ts` に、登録、パスワードでのログイン(成功と失敗)、端末の確認を行い、ロガーの出力のすべてと送信したメールの本文に、使ったパスワードの文字列が現れないことのテストを加え、失敗を確かめる(SC-005)
- [X] T021 [P] [US1] 画面のテストを `apps/web/tests/auth.test.tsx` に書き換え、失敗を確かめる。パスキーでの登録の画面のテストは、仕様の変更(004 FR-001、FR-002)により書き換え、理由をコメントに残す。
  - ログイン画面: ラベル「ID」「パスワード」の入力欄と「ログイン」ボタンが最初に表示され、「パスキーでログイン」は別のボタン。パスワードの欄は `type="password"`、`autocomplete="current-password"` で、「表示」ボタンで `type="text"` に切り替わる。
  - `browserSupportsWebAuthn` が `false` のとき、「パスキーでログイン」が無効で「このブラウザはパスキーに対応していません」と表示され、パスワードの欄は使える。
  - `/auth/login/password` が 202 のとき、「ワンタイムパスワード」の入力欄と「メールを再送する」が表示され、`/auth/login/device/verify` が 204 なら `/calendar` へ移る。
  - 401 のとき「ID またはパスワードが正しくありません」と、復旧の画面へのリンクが表示される。
  - 登録画面: メールの確認の後に、ラベル「パスワード」と「パスワード(確認)」の入力欄(`autocomplete="new-password"`)が表示される。2つが一致しないと送信しない。422 の `common`、`contains_handle`、`too_small` をそれぞれ「よく使われるパスワードは使えません」「ID を含むパスワードは使えません」「パスワードは12文字以上にしてください」と表示する。
- [X] T022 [P] [US1] `e2e/auth.spec.ts` を書き換え、失敗を確かめる。ファイル先頭の `test.skip`(Chromium のみ)は、パスキーを使うテストだけに限る。
  - (a) 全ブラウザ: `/signup` で ID、メール、`fetchOtp` の OTP、パスワード2回で登録 → メインのナビゲーションが表示される → `/profile` でログアウト → `/login` で ID とパスワードでログインすると OTP なしで入れる。
  - (b) 全ブラウザ: (a) の利用者で、`browser.newContext()` の新しいコンテキストからログインすると OTP の入力欄が出て、`fetchOtp` の OTP でログインできる。Mailpit に「新しい端末からログインしました」が届く。
  - (c) 全ブラウザ: 存在しない ID と誤ったパスワードで同じエラーメッセージ。
  - パスキーで登録する既存のテストは、(a) の後にセキュリティ設定でパスキーを追加してパスキーでログインする流れに書き換える(US2 で通す。Chromium のみ)。
- [X] T023 [P] [US1] `e2e/helpers/seed-session.ts` の `seedUser` に省略可能な `password` を加え、渡されたら `apps/server/src/auth/password.ts` の `hashPassword` で `password_hash` と `password_changed_at` を設定する

### Implementation for User Story 1

- [X] T024 [US1] `apps/server/src/auth/routes.ts` の登録を変え、T018 を通す(contracts「登録」)。
  - `verify-email`: メールの確認の後、204 を返す(パスキーのオプションを返さない)。
  - `finish`: 要求を `{ registrationId: uuidSchema, password: passwordSchema }` にする。確認済みの登録途中のデータを取り、`checkPasswordRules(password, handle)` が空でなければ `errors.validation([{ field: 'password', code }])`。ユーザーの作成と同じトランザクションで `password_hash`(`hashPassword`)と `password_changed_at = now` を設定する。パスキーの登録の処理と `subjectOfChallenge` の利用を削除する。ログイン状態にし、`trust` で端末を確認済みにして `__Host-device` を設定する。
  - 使わなくなった import と関数を削除する。
- [X] T025 [US1] `apps/server/src/auth/routes.ts` にパスワードでのログインと端末の確認を加え、T019、T020 を通す(contracts「ログイン」、research.md §3、§4)。
  - `POST /auth/login/password`: `login-verify-ip`(10回/60秒)と `login-ip-handle`(5回/60秒)を比較の前に消費する。要求は `{ handle: handleSchema, password: passwordSchema }`(検証の失敗も 401 にそろえるため、形式の検証に失敗した場合は `verifyAgainstDummy` の後に `authenticationFailed`)。ユーザーがいない、または `password_hash` が NULL なら `verifyAgainstDummy` の後に 401。比較に失敗したら 401。
  - 成功時、`getCookie(c, DEVICE_COOKIE)` のトークンで `isTrusted` なら `trust`(期限の延長)、full のセッション、204。そうでなければ `device_check` のセッションを作り、`issueOtp(deps, 'new_device', user.id)` をメールで送り(失敗は 502 `mail-failed`)、202 `{ next: 'verify-device' }`。
  - `POST /auth/login/device/verify`(`requireAuth('device_check')`): `otp-verify-ip`(30回/時)を消費し、`verifyOtp(deps, 'new_device', userId, code)`。成功したら現在のセッションを失効させ、`trust`、full のセッション、`__Host-device`、`notify(…, 'new_device_login')`、204。
  - `POST /auth/login/device/resend`(`requireAuth('device_check')`): `otp-send-user`(3回/時)を消費して再送、202。
- [X] T026 [P] [US1] `apps/web/src/features/auth/PasswordInput.tsx` を作る。ラベル付きの `input`(`type` は `password` と `text` を切り替え)、`autocomplete` を props で受け取る、「表示」「隠す」の切り替えボタン(`aria-pressed`、`aria-controls`)。貼り付けを妨げない
- [X] T027 [US1] `apps/web/src/features/auth/LoginPage.tsx` を作り直し、T021 のログインの部分を通す(research.md §12)。
  - ID と `PasswordInput`(`current-password`)と「ログイン」を最初に表示する。
  - 202 なら、同じ画面で「ワンタイムパスワード」の入力欄、「確認する」、「メールを再送する」を表示する。
  - 「パスキーでログイン」のボタンは既存のパスキーのログインの処理を呼ぶ。`passkeysSupported()` が `false` なら無効にし、`apps/web/src/features/auth/Unsupported.tsx` の文言(短く「このブラウザはパスキーに対応していません」に変える)をボタンの説明として `aria-describedby` で結ぶ。
- [X] T028 [US1] `apps/web/src/features/auth/SignupPage.tsx` を作り直し、T021 の登録の部分を通す。メールの確認の後に `PasswordInput`(`new-password`)を2つ(「パスワード」「パスワード(確認)」)表示し、一致を確かめてから `finish` を送る。サーバーの 422 の `password` のコードを日本語の文言に変える。WebAuthn の非対応の表示とパスキーの登録の処理を削除する。登録の完了後の画面で「セキュリティ設定でパスキーを追加すると、パスワードなしでログインできます」と案内する
- [X] T029 [US1] T018〜T022 と `apps/server/tests/`、`apps/web/tests/` のすべてのテスト、`e2e/auth.spec.ts` の US1 の部分(全ブラウザ)が通ることを確かめる

**Checkpoint**: パスキー非対応の端末でも登録とログインができる(MVP)。

---

## Phase 4: User Story 2 - パスキーでもログインできる (Priority: P2)

**Goal**: パスワードでログインした利用者がパスキーを追加でき、パスキーでもログインできる。既存のパスキーだけの利用者は変わらずログインできる。

**Independent Test**: パスワードでログインし、パスワードで本人確認をしてパスキーを追加し、ログアウト後にパスキーでログインできる。パスワードを持つ利用者は最後のパスキーを削除できる。

### Tests for User Story 2 ⚠️

- [X] T030 [P] [US2] `apps/server/tests/integration/step-up.test.ts`(新規)に、`POST /auth/step-up/password` のテストを書き、失敗を確かめる: 正しいパスワードで 204 になり、直後の `/me/passkeys/options` が 200。誤りで 401。パスワードを持たない利用者は 401。6回目は 429(`step-up-user` 5回/15分)。full のセッションなしは 401
- [X] T031 [P] [US2] `apps/server/tests/integration/passkeys.test.ts` を、`registerUser`(パスワード)と `createPasskeyUser` を使うよう書き換え、次を加えて失敗を確かめる: パスワードを持つ利用者は、パスワードで本人確認をしてパスキーを追加でき(`passkey_added` の通知)、最後のパスキーも削除できる(204)。パスワードを持たない利用者の最後のパスキーは 409 `last-passkey`(従来どおり)
- [X] T032 [P] [US2] `apps/web/tests/security-settings.test.tsx` に、本人確認の部品のテストを加え、失敗を確かめる: `me.hasPassword` が `true` なら、パスキーの追加と削除の前に「パスワード」の入力を求め、`/auth/step-up/password` を呼ぶ。`false` なら従来のパスキーの本人確認を使う。`hasPassword` が `true` なら最後のパスキーの削除ボタンが有効
- [X] T033 [P] [US2] `e2e/auth.spec.ts`(Chromium のみ)に: パスワードで登録 → セキュリティ設定でパスワードで本人確認をして仮想認証器でパスキーを追加 → ログアウト → 「パスキーでログイン」でログインできる、を加える。`seedUser`(パスワードなし)に `signInAs` でログインして仮想認証器でパスキーを登録した既存の利用者が、ログアウト後もパスキーでログインできる(SC-003)ことも加える
  - **実装時の記録**: パスキーだけの既存の利用者は、パスキーの追加に必要な本人確認を画面から行えない(パスキーもパスワードもない状態から作れない)ため、E2E では再現しなかった。SC-003 は統合テスト(`createPasskeyUser` とパスキーのログイン。`login.test.ts`、`passkeys.test.ts`)で確かめた

### Implementation for User Story 2

- [X] T034 [US2] `apps/server/src/auth/routes.ts` に `POST /auth/step-up/password`(`requireAuth('full')`)を加え、T030 を通す。`step-up-user` を消費し、ユーザーの `password_hash` が NULL なら `verifyAgainstDummy` の後に 401、比較に失敗したら 401、成功したら `sessions.markStepUp`
- [X] T035 [US2] `apps/server/src/auth/account-security.ts` の `DELETE /me/passkeys/:id` を、最後のパスキーでもユーザーの `password_hash` が NULL でなければ削除できるように変え、T031 を通す(同じトランザクションで `users` を読む)
- [X] T036 [P] [US2] `apps/web/src/features/auth/StepUpDialog.tsx` を作る。`useStepUp()` フックとして、`me.hasPassword` なら `PasswordInput`(`current-password`)を出して `/auth/step-up/password` を呼び、そうでなければ `apps/web/src/lib/passkey.ts` の `stepUp()` を呼ぶ。キャンセルと失敗を呼び出し元に返す
- [X] T037 [US2] `apps/web/src/features/auth/SecuritySettings.tsx` の本人確認を `StepUpDialog` に替え、最後のパスキーの削除ボタンを `me.hasPassword` で有効にする。T032 を通す
- [X] T038 [US2] `apps/web/src/features/profile/ProfilePage.tsx` の退会の本人確認を `StepUpDialog` に替える。`apps/web/tests/profile.test.tsx` に、パスワードを持つ利用者がパスワードで本人確認をして退会できるテストを先に加える。`apps/server/tests/integration/account-delete.test.ts` を `registerUser`(パスワード)と `stepUpWithPassword` で書き直し、退会で `trusted_devices` の行が消えることを加える
- [X] T039 [US2] T030〜T033 と、すべての単体テスト、`e2e/auth.spec.ts` の US2 の部分が通ることを確かめる

**Checkpoint**: パスワードとパスキーの両方でログインでき、既存の利用者も変わらない。

---

## Phase 5: User Story 3 - パスワードを設定、変更、再設定する (Priority: P2)

**Goal**: パスワードの変更、既存のパスキーだけの利用者のパスワードの追加、OTP によるパスワードの再設定ができ、完了時にほかの端末のログインと端末の確認が失効し、通知が届く。メールアドレスの変更はパスワードでも本人確認できる。

**Independent Test**: パスワードを変更して新しいパスワードでログインでき、OTP で再設定でき、パスキーだけの利用者がパスワードを追加できる。

### Tests for User Story 3 ⚠️

- [X] T040 [P] [US3] `apps/server/tests/integration/password.test.ts`(新規)に `PUT /me/password` のテストを書き、失敗を確かめる(contracts「アカウントのセキュリティ」)。
  - パスワードを持つ: 正しい `currentPassword` と条件を満たす `newPassword` で 204。新しいパスワードでログインでき、古いパスワードでは 401。同じユーザーのほかのセッションは 401 になり、現在のセッションは使える。`trusted_devices` が0件になる(次のログインは 202)。`password_changed` の通知が届く。誤った `currentPassword` で 401、6回目は 429(`password-change-user` 5回/15分)。`newPassword` の条件違反は 422。
  - パスワードを持たない(`createPasskeyUser`): step-up なしは 403 `step-up-required`。パスキーで step-up した後は `{ newPassword }` で 204、`password_set` の通知、`/me` が `hasPassword: true`、パスワードでのログインができる(未確認の端末なので 202)。
- [X] T041 [P] [US3] `apps/server/tests/integration/recovery.test.ts` を書き換え、失敗を確かめる。パスキーの登録のみを前提としたテストは、仕様の変更(004 FR-009)により書き換え、理由をコメントに残す。
  - `recovery/verify` が 204 で、recovery のセッションを設定し、本文にパスキーのオプションを含まない。
  - `recovery/password { password }`: 204、full のセッションと `__Host-device`、ほかのセッションの失効、以前の `trusted_devices` の全削除と、この端末だけの確認、`recovered` の通知。新しいパスワードで、同じ端末では 204 でログインできる。条件違反は 422。full のセッションでの呼び出しは 401。
  - `recovery/passkey/options` と `recovery/finish`: 従来のパスキーの登録で復旧でき、上と同じく失効と端末の確認が行われる。
  - ID の存在の有無が応答から分からないこと(既存のテスト)は維持する。
- [X] T042 [P] [US3] `apps/server/tests/integration/email-change.test.ts` に、パスワードで本人確認をしてメールアドレスを変更でき、変更前と変更後の両方のアドレスへ `email_changed` が届くテストを加え、失敗を確かめる(FR-017)
- [X] T043 [P] [US3] 画面のテストを加え、失敗を確かめる。
  - `apps/web/tests/security-settings.test.tsx`: `hasPassword: true` なら「パスワードを変更」のフォーム(「現在のパスワード」「新しいパスワード」「新しいパスワード(確認)」)、最終変更日の表示。`false` なら「パスワードを設定」のフォーム(現在のパスワードの欄なし)で、送信前にパスキーの本人確認を求める。成功時に「パスワードを変更しました。ほかの端末はログアウトされました」と表示する。
  - `apps/web/tests/auth.test.tsx` の復旧画面: OTP の後に「新しいパスワードを設定」のフォームが既定で表示され、`passkeysSupported()` が `true` のときだけ「パスキーを登録する」も選べる。
- [X] T044 [P] [US3] `e2e/auth.spec.ts` の復旧のテストを書き換え(全ブラウザ): パスワードで登録 → 新しいコンテキストで `/recover` から OTP で復旧して新しいパスワードを設定 → ログインできる → 元のコンテキストはログアウトされている(`/calendar` で `/login` へ移る)

### Implementation for User Story 3

- [X] T045 [US3] `apps/server/src/auth/account-security.ts` に `PUT /me/password` を加え、T040 を通す(research.md §8)。要求は `z.object({ currentPassword: z.string().max(1024).optional(), newPassword: passwordSchema })`。`password_hash` があれば `password-change-user` を消費して `currentPassword` を比較、無ければ step-up を確かめる(`requireStepUp` と同じ判定)。`checkPasswordRules`、ハッシュの保存、`sessions.revokeAllForUser(userId, 現在のトークン)`、`revokeAll`(trusted-device)、`notify(…, 'password_changed' | 'password_set')`
- [X] T046 [US3] `apps/server/src/auth/routes.ts` の復旧を変え、T041 を通す(research.md §9)。`recovery/verify` は 204。`POST /auth/recovery/password`(`requireAuth('recovery')`)と `POST /auth/recovery/passkey/options`(`requireAuth('recovery')`、従来の `registrationOptions(deps, 'recover', …)` を返す)を加える。完了の処理(全セッションの失効、`revokeAll`、`trust`、full のセッション、`__Host-device`、`recovered` の通知)を1つの内部関数 `completeRecovery(c, userId)` にまとめ、`recovery/password` と `recovery/finish` の両方から呼ぶ(憲章 VII)
- [X] T047 [US3] `apps/server/src/auth/account-security.ts` の `email-change/verify` で、変更後のアドレスへも `notify(…, 'email_changed', newEmail)` を送る。T042 を通す
- [X] T048 [US3] `apps/web/src/features/auth/SecuritySettings.tsx` にパスワードの設定と変更のフォームを加え、T043 のセキュリティ設定の部分を通す。`PasswordInput` を使い、新しいパスワードの欄は `new-password`。成功後に `me` を再取得する
- [X] T049 [US3] `apps/web/src/features/auth/RecoveryPage.tsx` を作り直し、T043 の復旧の部分と T044 を通す。OTP の後に「新しいパスワードを設定」(既定)と「パスキーを登録する」(対応環境のみ)を選べるようにする
- [X] T050 [US3] T040〜T044 と、すべての単体テスト、`e2e/auth.spec.ts` が通ることを確かめる

**Checkpoint**: すべてのユーザーストーリーが独立して動く。

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T051 [P] `e2e/accessibility.spec.ts` の対象に、パスワードの入力欄を表示した `/login`、`/signup`(パスワードの段階)、`/recover`(パスワードの段階)、`/settings/security` を含め、重大な違反がないことを確かめる。キーボードだけでパスワードでログインできる(表示の切り替えボタンを含む)テストを加える
- [X] T052 [P] `apps/server/tests/integration/email-privacy.test.ts` と、パスキーでの登録を前提にした残りのテスト(`grep -rn "registration/finish" apps/server/tests e2e`)を、`registerUser`(パスワード)か `createPasskeyUser` に置き換える。期待は変えない
- [X] T053 [P] エクスポート(`apps/server/src/diaries/export.ts` が出す内容)に `password_hash` やパスワードが含まれないことを、`apps/server/tests/integration/export.test.ts` にテストで加える(SC-005)
- [ ] T054 `quickstart.md` の手で確かめる手順 1〜10 と「既存の利用者(パスキーだけ)を確かめる」を行い、期待と違う点があれば該当するストーリーのタスクに戻って直す
- [ ] T055 品質ゲート: `npm run verify`(型検査、lint、単体と統合のテスト、`npm audit`、secretlint)と `npx playwright test`(全プロジェクト)がすべて成功することを確かめる(憲章「品質ゲート」)。Firefox が起動できない環境では、その旨と他のブラウザの結果を記録する

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: すぐに始められる。T001〜T004 は互いに独立(T002〜T004 は [P])
- **Foundational (Phase 2)**: T004(一覧)の後に T008。T011(DB)の後に T012、T013。T008、T011、T012、T014 の後に T017。すべてのストーリーの前提
- **US1 (Phase 3)**: Foundational の後。MVP
- **US2 (Phase 4)**: US1 の後(パスワードでの登録とログインを使ってパスキーを追加する)
- **US3 (Phase 5)**: US1 の後。US2 の `StepUpDialog`(T036)を T048 が使うため、T048 は T036 の後。サーバー側(T045〜T047)は US2 と並行できる
- **Polish (Phase 6)**: すべてのストーリーの後

### Within Each User Story

- テストを先に書き、失敗を確かめてから実装する(憲章 V)
- `apps/server/src/auth/routes.ts` を変えるタスク(T024、T025、T034、T046)は順に行う
- `apps/server/src/auth/account-security.ts` を変えるタスク(T035、T045、T047)は順に行う
- `apps/web/src/features/auth/SecuritySettings.tsx` を変えるタスク(T037、T048)は順に行う
- `e2e/auth.spec.ts` を変えるタスク(T022、T033、T044)は同時に編集しない

### Parallel Opportunities

- Setup: T002、T003、T004
- Foundational のテスト: T005、T006、T007。実装: T009、T010、T013、T014、T015、T016
- US1 のテスト: T018〜T023(別ファイル)。実装: T026 は T027 の前に、T027 と T028 は別ファイルで並行できる
- US2 のテスト: T030〜T033。実装: T036 は T034、T035 と並行
- US3 のテスト: T040〜T044。サーバーの実装は US2 の画面の作業と並行できる

---

## Parallel Example: User Story 1

```bash
# US1 のテストを同時に書く:
Task: "T018 registration.test.ts をパスワードでの登録に書き換える"
Task: "T019 login.test.ts にパスワードのログイン、端末の確認、列挙の防止を加える"
Task: "T020 log-safety.test.ts にパスワードが出ないことを加える"
Task: "T021 auth.test.tsx のログインと登録の画面"
Task: "T022 e2e/auth.spec.ts のパスワードの登録とログイン(全ブラウザ)"
```

## Parallel Example: Foundational

```bash
Task: "T005 passwordSchema のテスト"
Task: "T006 password.ts の単体テスト"
Task: "T007 schema.test.ts のマイグレーションのテスト"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1(ADR、001 の注記、一覧)
2. Phase 2(DB、パスワードの処理、端末の確認、テスト用の手順)
3. Phase 3(US1)を終え、パスキー非対応のブラウザで登録とログインができることを確かめる
4. **STOP and VALIDATE**: T029 と quickstart の手順1〜6

ただし US1 だけでは、パスワードを忘れた利用者は復旧でパスキーしか登録できず、パスキー非対応の端末では復旧できない。リリースは US3(パスワードの再設定)まで含めるのが望ましい。

### Incremental Delivery

1. Setup + Foundational → 土台
2. US1 → パスワードでの登録とログイン(MVP)
3. US2 → パスキーの追加とログイン、パスワードでの本人確認
4. US3 → パスワードの変更、設定、再設定と、メールアドレスの変更の通知
5. Polish → アクセシビリティ、残りのテストの置き換え、品質ゲート

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- 既存のテストを変える場合は、理由をコメントに残す(憲章 V)
- パスワードの値は、テストの失敗メッセージを含め、どこにも出力しない
- Commit after each task or logical group

## 実装時の記録(2026-11-23)

- よく使われるパスワードの一覧: SecLists の `10-million-password-list-top-1000000.txt` は `xato-net-10-million-passwords-1000000.txt` に名前が変わっていたため、後者を使った(research.md、ADR-0008 を更新)。一覧は 46,146 行。
- T055: `npm run verify` は成功(型検査、lint、単体と統合のテスト 404 件、`npm audit` 0 件、secretlint)。`npx playwright test` は、開発サーバーを `APP_ORIGIN=https://localhost:5173 RP_ID=localhost` で起動して実行し、Chromium、WebKit、mobile-360 で 140 件成功、7 件スキップ(ブラウザの条件による)。Firefox はこの端末で起動できず(`browserType.launch: Failed to launch the browser process`)、45 件が起動の失敗で実行できなかった。`npx playwright install firefox` で入れ直してから確かめる必要がある。
- T054: 手での確認は未実施。quickstart の手順 1〜10 の多くは E2E(`e2e/auth.spec.ts`、`e2e/accessibility.spec.ts`)で自動化した。
