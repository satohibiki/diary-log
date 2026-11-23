# Contract: 認証 API の変更

**Feature**: [../spec.md](../spec.md) | **Date**: 2026-11-22

基底のパスは `/api/v1`。要求と応答は JSON。エラーは既存の problem 形式(`{ type, title, status, errors? }`)。状態を変える要求は、既存のとおり Origin の確認を受ける。

## Cookie

| 名前 | 属性 | 内容 |
|---|---|---|
| `__Host-session` | 既存 | scope に `device_check`(Max-Age 600)を追加 |
| `__Host-device` | HttpOnly、Secure、SameSite=Strict、Path=/、Max-Age 7776000(90日) | 確認済みの端末のトークン(research §4) |

## 登録

| メソッドとパス | 要求 | 応答 | 変更 |
|---|---|---|---|
| POST `/auth/registration/start` | `{ handle, email }` | 202 `{ registrationId }` | 変更なし |
| POST `/auth/registration/resend` | `{ registrationId }` | 202 | 変更なし |
| POST `/auth/registration/verify-email` | `{ registrationId, code }` | **204**(パスキーのオプションを返さない) | 変更 |
| POST `/auth/registration/finish` | **`{ registrationId, password }`** | 201、`__Host-session`(full)と `__Host-device` を設定 | 変更(パスキーの登録を削除) |

- `finish` のエラー: メールアドレスが未確認 → 401 `authentication-failed`。パスワードの条件 → 422 `validation`(`errors[].field = "password"`、code は data-model.md の表)。ID の重複 → 409 `handle-taken`。

## ログイン

| メソッドとパス | 要求 | 応答 |
|---|---|---|
| POST `/auth/login/password`(新規) | `{ handle, password }` | 確認済みの端末: 204、`__Host-session`(full)、`__Host-device` の期限を延長。<br>未確認の端末: 202 `{ next: "verify-device" }`、`__Host-session`(device_check)。登録済みのアドレスへ OTP を送る |
| POST `/auth/login/device/verify`(新規、device_check が必要) | `{ code }` | 204、device_check のセッションを失効させ、`__Host-session`(full)と `__Host-device` を設定。`new_device_login` を通知 |
| POST `/auth/login/device/resend`(新規、device_check が必要) | なし | 202 |
| POST `/auth/login/options` | なし | 変更なし(パスキー) |
| POST `/auth/login/verify` | `{ handle, challengeId, credential }` | 変更なし(パスキー。端末の確認は不要) |

- `login/password` の失敗: ID がない、パスワードを持たない、パスワードが違う、のいずれも 401 `authentication-failed`(同じ本文。research §3)。回数制限 → 429。
- `device/verify` の失敗: 401 `authentication-failed`。OTP の条件は 001 FR-005a。
- `device/resend` の回数制限: `otp-send-user` 3回/時。
- メールの送信の失敗: 502 `mail-failed`(既存と同じ)。

## 復旧

| メソッドとパス | 要求 | 応答 | 変更 |
|---|---|---|---|
| POST `/auth/recovery/start` | `{ handle }` | 202 | 変更なし |
| POST `/auth/recovery/verify` | `{ handle, code }` | **204**、`__Host-session`(recovery) | 変更(パスキーのオプションを返さない) |
| POST `/auth/recovery/password`(新規、recovery が必要) | `{ password }` | 204 | 新規 |
| POST `/auth/recovery/passkey/options`(新規、recovery が必要) | なし | 200 パスキーの登録のオプション | 新規 |
| POST `/auth/recovery/finish`(recovery が必要) | `{ challengeId, credential, name? }` | 204 | 変更なし |

- `recovery/password` と `recovery/finish` の完了時: すべてのセッションと確認済みの端末を失効させ、この端末を確認済みにし(`__Host-device`)、`__Host-session`(full)を設定し、`recovered` を通知する。

## 本人確認(step-up)

| メソッドとパス | 要求 | 応答 |
|---|---|---|
| POST `/auth/step-up/password`(新規、full が必要) | `{ password }` | 204(5分間 step-up 済み)。誤り → 401。回数制限 `step-up-user` 5回/15分 |
| POST `/auth/step-up/options`、`/auth/step-up/verify` | 変更なし(パスキー) | |

- step-up が必要な操作で未確認の場合: 403 `step-up-required`、文言「本人確認が必要です」。

## アカウントのセキュリティ

| メソッドとパス | 要求 | 応答 |
|---|---|---|
| GET `/me` | なし | 既存の項目に `hasPassword`、`passwordChangedAt` を追加 |
| PUT `/me/password`(新規、full が必要) | パスワードを持つ: `{ currentPassword, newPassword }`<br>持たない: `{ newPassword }`(step-up が必要) | 204。ほかのセッションと全端末の確認を失効。`password_changed` または `password_set` を通知 |
| DELETE `/me/passkeys/:id` | 変更なし | 最後のパスキー: パスワードを持てば 204、持たなければ 409 `last-passkey` |
| POST `/me/email-change/verify` | 変更なし | 完了時に変更前と変更後の両方のアドレスへ `email_changed` を通知 |

- `PUT /me/password` のエラー: 現在のパスワードの誤り → 401(回数制限 `password-change-user` 5回/15分)。パスワードを持たず step-up がない → 403 `step-up-required`。条件 → 422 `validation`。

## メール

| 種類 | 件名 |
|---|---|
| OTP `new_device` | 【diary-log】新しい端末からのログインの確認 |
| 通知 `new_device_login` | 【diary-log】新しい端末からログインしました |
| 通知 `password_set` | 【diary-log】パスワードが設定されました |
| 通知 `password_changed` | 【diary-log】パスワードが変更されました |
| 通知 `recovered`(文言の変更) | 本文を「パスワードの再設定または新しいパスキーの登録により、アカウントが復旧されました」に変える |

- どのメールにも、パスワード、日記の内容、IP アドレス、端末の情報を含めない。
