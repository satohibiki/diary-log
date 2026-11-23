# Data Model: ID とパスワードでのログイン(パスキーも利用可)

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-22

既存の表(001)への追加と変更のみを記す。マイグレーションは drizzle-kit で `apps/server/drizzle/` に生成する。既存の行は変えない(パスワードは利用者が設定するまで持たない。FR-013)。

## users(変更)

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| password_hash | text | NULL 可 | `scrypt$<logN>$<r>$<p>$<salt>$<hash>`(research §1)。NULL はパスワードを持たないこと |
| password_changed_at | timestamptz | NULL 可 | パスワードを設定または変更した日時。`password_hash` が NULL なら NULL |

- 検査制約: `(password_hash IS NULL) = (password_changed_at IS NULL)`。
- `password_hash` は暗号化の対象にしない。復元できない形のため、憲章 II の「日記データとメールアドレスの暗号化」の対象外とする(ADR-0008 に記録)。
- ログイン方法の不変条件: `password_hash IS NOT NULL` または パスキーが1つ以上(アプリケーションで保証する。FR-011)。

## trusted_devices(新規)

確認済みの端末(spec の Key Entities)。

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| user_id | uuid | NOT NULL、`users.id` への外部キー、on delete cascade | |
| token_hash | bytea | NOT NULL | Cookie `__Host-device` のトークンの SHA-256 |
| last_used_at | timestamptz | NOT NULL | 確認またはパスワードでのログインの日時 |
| expires_at | timestamptz | NOT NULL | `last_used_at` + 90日 |
| created_at | timestamptz | NOT NULL、既定 now() | |

- 主キー: `(user_id, token_hash)`。
- 索引: `expires_at`(期限切れの削除用)。
- 端末を特定できる情報(User-Agent、IP アドレス、機種名)は持たない。

### 状態の移り変わり(ユーザーと端末の組)

```text
未確認 ──(パスワード + OTP の確認)──────────▶ 確認済み
未確認 ──(アカウントの作成、OTP による復旧の完了)──▶ 確認済み
確認済み ──(パスワードでのログイン)──▶ 確認済み(期限を90日に延長)
確認済み ──(最後の利用から90日)──▶ 未確認(行を削除)
確認済み ──(パスワードの設定、変更、復旧の完了、退会)──▶ 未確認(そのユーザーの全行を削除)
```

## sessions(変更)

- 列挙型 `session_scope` に `device_check` を加える。有効期限は10分。許可する操作は、端末の確認の OTP の検証と再送だけ(`requireAuth('device_check')`)。

## email_otps(変更)

- 列挙型 `otp_purpose` に `new_device` を加える。`subject_id` はユーザーの ID。有効期限、試行の回数、同時に有効な件数は 001 FR-005a のとおり(既存の `issueOtp`、`verifyOtp` をそのまま使う)。

## 列挙型で使わなくなる値

- `challenge_purpose` の `register`(パスキーでの登録を削除するため。research §6)。値は削除しない。

## 共有の型(packages/shared)

- `Me` に `hasPassword: boolean` と `passwordChangedAt: string | null` を加える(FR-016)。
- `passwordSchema`: NFKC で正規化したうえで、コードポイント数が12以上128以下の文字列(research §2)。正規化した値を出力する。

## 検証の規則(サーバー)

| 規則 | エラーの項目とコード |
|---|---|
| 12文字未満 | `password` / `too_small` |
| 128文字を超える | `password` / `too_big` |
| よく使われるパスワードの一覧に一致 | `password` / `common` |
| ID を含む | `password` / `contains_handle` |
| 変更時に現在のパスワードが誤り | 401 `authentication-failed` |
