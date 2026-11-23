# Research: ID とパスワードでのログイン(パスキーも利用可)

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-22

## 0. 現状(001 の実装)

- 登録: `registration/start`(ID とメール) → `verify-email`(OTP。応答でパスキーの登録のオプションを返す) → `registration/finish`(パスキーを登録してユーザーを作る)。
- ログイン: `login/options` と `login/verify`(パスキーのみ)。
- 復旧: `recovery/start` → `recovery/verify`(OTP。scope `recovery` のセッション) → `recovery/finish`(新しいパスキーの登録のみ)。
- 再認証(step-up): パスキーのみ。パスキーの追加と削除、メールアドレスの変更、退会で必須(`requireStepUp`)。
- セッション: DB にトークンのハッシュを保存。Cookie `__Host-session`。scope は `full`(30日)と `recovery`(10分)。
- OTP: `email_otps`。HMAC で保存し、10分、1回限り、5回まで、同時に3件まで(001 FR-005a)。
- ログ: 出力できる項目を許可リストで限定している(`platform/logger.ts`)。要求の本文は出力しない。

## 1. パスワードのハッシュ

- **Decision**: Node.js 標準の `crypto.scrypt` を使う。パラメーターは N=2^15、r=8、p=3(1回あたり約32MB)。ソルトはユーザーごとに16バイトの乱数、出力は32バイト。保存は自己記述の文字列 `scrypt$15$8$3$<salt base64url>$<hash base64url>` にし、将来パラメーターを上げられるようにする。比較は `timingSafeEqual`。
- **Rationale**: OWASP Password Storage Cheat Sheet の scrypt の推奨の組の1つ(メモリとコストの釣り合い)。標準機能だけで実装でき、実行時依存を増やさない(憲章 VI、ADR-0004)。
- **Alternatives considered**:
  - Argon2id(`argon2` パッケージ): 推奨の第一候補だが、ネイティブの依存が増える。scrypt が標準で使えるため不採用。
  - bcrypt: 72バイトの上限があり、64文字以上の日本語のパスフレーズを受け付けられない。
  - PBKDF2: メモリを使わず、GPU による推測に弱い。
  - pepper(サーバーの秘密鍵との HMAC): DB だけが漏えいした場合に有効だが、鍵の入れ替えの運用が要る。今回は入れず、ADR-0008 に将来の検討として記録する(YAGNI)。

## 2. パスワードの条件

- **Decision**:
  - Unicode の NFKC で正規化してから、長さの判定とハッシュを行う(全角と半角の違いでログインできなくなるのを防ぐ)。
  - 長さは正規化後のコードポイント数で 12〜128。128 の上限は、ハッシュの計算に過大な入力を渡されないための値で、spec の「64文字以上まで受け付ける」を満たす。
  - よく使われるパスワードの一覧(下記)に、小文字にしたうえで一致するものを拒否する。
  - 小文字にしたパスワードが、小文字にした ID を含む場合は拒否する。
  - 組み合わせの強制、定期的な変更は行わない。
- **Rationale**: spec FR-003、NIST SP 800-63B。
- **よく使われるパスワードの一覧**: SecLists(MIT License)の `Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt` から、NFKC と小文字化のあとで12文字以上のものだけを取り出し、`apps/server/src/auth/common-passwords.txt` としてリポジトリに置く。サーバーの起動時に `Set` に読み込む。外部のサービスには問い合わせない(憲章 III)。出典とライセンスは ADR-0008 とファイルの先頭のコメントに記す。
- **判定の場所**: 長さの判定は `packages/shared` の `passwordSchema` で画面とサーバーの両方が使う(憲章 VII)。一覧と ID の判定はサーバーだけで行い、画面はサーバーの返す項目のエラーを表示する(一覧を画面へ配信しない)。

## 3. ログインの失敗の応答をそろえる

- **Decision**: ID が存在しない場合と、パスワードを持たない場合は、固定のダミーのハッシュに対して同じ scrypt の比較を行ってから、同じ `authentication-failed`(401)を返す。
- **Rationale**: FR-005、SC-004。ハッシュの計算時間が応答の差の大部分を占めるため、全経路で1回ずつ計算すればそろう。
- **試行の制限**: パスキーのログインと同じバケット(`login-verify-ip` 10回/分、`login-ip-handle` 5回/分)を使い、パスワードの比較の前に消費する。ID 単独では制限しない(ADR-0003 の実装結果、spec の Edge Cases)。

## 4. 初めて使う端末の確認(FR-015)

- **Decision**:
  - 端末(ブラウザ)ごとに乱数のトークンを Cookie `__Host-device`(HttpOnly、Secure、SameSite=Strict、Path=/、Max-Age 90日)に保持する。DB の `trusted_devices` には、トークンのハッシュとユーザーの組、最後の利用日時、有効期限だけを保存する。
  - パスワードが正しく、Cookie のトークンがそのユーザーで有効なら、`full` のセッションを作る。有効期限を最後の利用から90日に延ばし、Cookie も同じだけ延ばす。
  - 有効でなければ、scope `device_check`(10分)のセッションを作り、登録済みのメールアドレスへ OTP(用途 `new_device`)を送り、`202 { next: "verify-device" }` を返す。
  - `device_check` のセッションで OTP を確かめたら、そのセッションを失効させ、`full` のセッションを作り、端末を確認済みにして Cookie を設定し、`new_device_login` の通知を送る。
  - アカウントの作成と、OTP による復旧の完了でも、その端末を確認済みにする(メールの OTP を確かめた端末のため)。
- **Rationale**: 利用者の回答 B(Clarifications)。端末を特定する情報(機種名、IP アドレス)を持たずに実現できる(spec の Key Entities、憲章 II)。セッションと同じく、DB にはハッシュのみを置く。
- **1つのブラウザを複数のアカウントで使う場合**: Cookie のトークンは1つで、`trusted_devices` に (user, token) の組ごとの行を持つ。確認のたびに、既存の Cookie があればそのトークンを使う。
- **パスキーでのログイン**: 端末の確認は不要(spec の Edge Cases)。確認済みにもしない(パスワードを使わない端末を確認済みにする理由がない)。
- **Alternatives considered**:
  - 端末の指紋(User-Agent、IP など): 変わりやすく、個人を特定しうる情報を保存することになる。
  - 確認済みの状態をセッションに持たせる: ログアウトで消え、spec の「ログアウトしても失効しない」に反する。
  - 毎回 OTP: 利用者の回答と異なる。

## 5. 確認済みの状態の失効(FR-015a)

- **Decision**: パスワードの設定と変更、復旧の完了、退会の時に、そのユーザーの `trusted_devices` の行をすべて消す。復旧の完了では、消したあとで、その端末だけを確認済みにし直す(OTP を確かめた端末のため。research §4)。パスワードの変更では、操作した端末も失効させる(spec のとおり)。退会は外部キーの `on delete cascade` で消える。
- **期限切れの行**: `platform/cleanup.ts` の `deleteExpired` に加える。

## 6. 登録の流れ

- **Decision**: `verify-email` は、パスキーのオプションではなく `204` を返す。続けて `POST /auth/registration/finish` に `{ registrationId, password }` を送り、メールアドレスが確認済みならユーザーを作る。パスキーでの登録の経路(`registration/finish` のパスキー版)は削除する。パスキーは登録後にセキュリティ設定で追加する。
- **Rationale**: FR-001(登録時にパスキーを求めない)。パスキーでの登録の経路を残すと、画面と API の分岐が増える(憲章 VI)。登録後の画面で、パスキーの追加を案内する。
- **DB の列挙型**: `challenge_purpose` の `register` は使わなくなるが、列挙型からの値の削除は行わない(PostgreSQL では削除に型の作り直しが要り、既存の行の移行が増えるため)。

## 7. 本人確認(step-up)の方法を増やす

- **Decision**: `POST /auth/step-up/password { password }` を加え、正しければ既存のパスキーの step-up と同じく `stepUpUntil` を5分後にする。パスキーの追加と削除、メールアドレスの変更(FR-017)、退会、パスワードを持たない利用者のパスワードの設定(FR-008)で使う。エラーの文言「パスキーでの再認証が必要です」を「本人確認が必要です」に変える。
- **Rationale**: パスワードだけの利用者が、これらの操作をできるようにする。パスワードでの `full` のセッションは、確認済みの端末か OTP を経た端末でのみ作られるため、FR-017 の「確認済みの端末での現在のパスワード」を満たす。
- **試行の制限**: `step-up-user` 5回/15分。

## 8. パスワードの変更と設定

- **Decision**: `PUT /me/password { currentPassword?, newPassword }`。
  - パスワードを持つ場合: `currentPassword` を必須とし、比較する(`password-change-user` 5回/15分)。
  - 持たない場合: step-up(パスキー)を必須とする。
  - 完了時: そのユーザーのほかのセッションを失効させ(現在のセッションは残す)、確認済みの端末をすべて失効させ、`password_changed` または `password_set` の通知を送る(FR-010)。
- **削除**: パスワードの削除は設けない(spec の Edge Cases)。

## 9. 復旧

- **Decision**: `recovery/verify` は OTP を確かめて scope `recovery` のセッションを作り、`204` を返す。続けて次のどちらかを選ぶ。
  - `POST /auth/recovery/password { password }`: 新しいパスワードを設定する。
  - `POST /auth/recovery/passkey/options` と、既存の `POST /auth/recovery/finish`: 新しいパスキーを登録する。
  - どちらも完了時に、すべてのセッションと確認済みの端末を失効させ、その端末を確認済みにし、`full` のセッションを作り、`recovered` の通知を送る。
- **Rationale**: FR-009、FR-010。通知の文言は「パスワードの再設定または新しいパスキーの登録」に変える。

## 10. パスキーの削除

- **Decision**: 最後のパスキーの削除は、パスワードを持つ場合に限り許可する(FR-011)。持たない場合は従来の `409 last-passkey`。

## 11. メールアドレスの変更の通知

- **Decision**: 変更の完了時に、変更前のアドレスへの通知(既存)に加えて、変更後のアドレスへも `email_changed` を送る(FR-017)。

## 12. 画面

- **ログイン**(`LoginPage`): ID とパスワードの入力欄と「ログイン」を最初に表示する。その下に「パスキーでログイン」のボタンを置く。WebAuthn に対応していない場合、ボタンを無効にして非対応の旨を表示する(画面全体を非対応にしない)。`202 verify-device` なら、同じ画面でワンタイムパスワードの入力欄と再送のボタンを表示する。
- **登録**(`SignupPage`): メールの確認の後に、パスワードの入力欄(確認用に2回)を表示する。WebAuthn の非対応の表示は削除する。
- **復旧**(`RecoveryPage`): OTP の後に「新しいパスワードを設定」を既定で表示し、対応環境では「パスキーを登録」も選べる。
- **セキュリティ設定**(`SecuritySettings`): パスワードの有無と最終変更日、設定または変更のフォーム、パスキーの一覧(最後の1つの削除の可否を `hasPassword` で切り替える)。本人確認は、パスワードを持つ場合はパスワード、持たない場合はパスキー。退会(`ProfilePage`)の本人確認も同じ部品を使う。
- **入力欄**: `type="password"`、`autocomplete` は登録と変更で `new-password`、ログインと本人確認で `current-password`。表示と伏せ字の切り替えボタン。貼り付けを妨げない(FR-014)。

## 13. 扱うデータ、脅威、対策(憲章 I)

| 脅威 | 対策 |
|---|---|
| DB の漏えいによるパスワードの解読 | scrypt(N=2^15、r=8、p=3)とユーザーごとのソルト。よく使われるパスワードの拒否と12文字以上の条件 |
| パスワードの総当たり、リスト型攻撃 | IP と、IP と ID の組での回数制限。よく使われるパスワードの拒否。初めての端末での OTP(パスワードが当たってもログインできない) |
| ID の列挙 | 失敗の応答の内容と、ダミーのハッシュによる時間をそろえる |
| ハッシュの計算による負荷(DoS) | 長さの上限128、回数制限を比較の前に消費 |
| 端末の確認の回避 | Cookie は HttpOnly、Secure、SameSite=Strict、`__Host-`。DB にはハッシュのみ。90日で失効し、パスワードの変更と復旧で全失効 |
| メールの乗っ取り | 従来どおり最大のリスク(ADR-0003)。パスワードの変更、新しい端末、メールアドレスの変更を通知して気づけるようにする |
| パスワードのログやエラーへの混入 | ログは許可リストの項目のみ。検証エラーは項目名とコードのみを返す(値を返さない)。テストで確かめる(既存の `log-safety.test.ts` に加える) |
| 送信の途中の盗聴 | 既存の HTTPS と HSTS |

## 14. テストの方針(憲章 V)

- サーバー: 既存の統合テスト(実 DB)に、パスワードの登録、ログイン、端末の確認、変更、復旧、step-up、パスキーの削除の条件、ID の列挙の防止(応答の内容)、ログへの非出力を加える。`registration.test.ts`、`login.test.ts`、`recovery.test.ts` のパスキーでの登録の前提は、仕様の変更(004 FR-001)により書き換え、理由を記録する。
- 単体: `passwordSchema`、パスワードの条件の判定、ハッシュの生成と比較(パラメーターの読み取りを含む)。
- 画面: 各画面のテスト(Vitest、jsdom)。
- E2E: パスワードでの登録とログインは仮想認証器が不要なため、Chromium、Firefox、WebKit、mobile-360 のすべてで実行する。初めての端末の確認は、新しいブラウザのコンテキストと Mailpit の OTP で確かめる。パスキーのテストは Chromium のみ(従来どおり)。
