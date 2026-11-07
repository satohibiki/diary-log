# Data Model: 絵日記公開サービス

ID は UUID v7、時刻は `timestamptz` とする。`*_enc` は AES-256-GCM の暗号文で、`key_version` と
共に保存する。

## users

| 列 | 型 | 制約・説明 |
|---|---|---|
| id | uuid | 主キー |
| handle | text | 一意。`^[a-z0-9_]{3,20}$`、予約語を除く。画面と仕様書の「ID」に当たる |
| nickname | text | 1〜20文字(書記素単位) |
| email_enc | bytea | 暗号化。本人のみ参照。重複可 |
| avatar_enc | bytea | NULL 可。WebP、400px 以下 |
| visibility | enum | `private`(初期値)または `public` |
| key_version | int | |
| created_at, updated_at | timestamptz | |

## passkeys

| 列 | 型 | 制約・説明 |
|---|---|---|
| id | uuid | 主キー |
| user_id | uuid | users 参照、CASCADE |
| credential_id | bytea | 一意 |
| public_key | bytea | |
| sign_count | bigint | |
| transports | text[] | |
| name | text | 端末の表示名、最大50文字 |
| created_at, last_used_at | timestamptz | |

ルール: ユーザーの最後の1件は削除できない(FR-004)。

## sessions

| 列 | 型 | 制約・説明 |
|---|---|---|
| token_hash | bytea | 主キー。トークンの SHA-256 |
| user_id | uuid | users 参照、CASCADE |
| scope | enum | `full` または `recovery` |
| step_up_until | timestamptz | NULL 可。再認証の有効期限 |
| expires_at | timestamptz | `full` は30日、`recovery` は10分 |
| created_at | timestamptz | |

状態遷移: `recovery` → パスキーの登録 → `full`。このとき他のセッションはすべて削除する。

## webauthn_challenges

| 列 | 型 | 制約・説明 |
|---|---|---|
| id | uuid | 主キー |
| challenge | bytea | 1回限り |
| purpose | enum | `register`、`login`、`step_up`、`add_passkey` |
| subject_id | uuid | NULL 可。pending_registrations または users の ID |
| expires_at | timestamptz | 5分 |

## pending_registrations

| 列 | 型 | 制約・説明 |
|---|---|---|
| id | uuid | 主キー |
| handle | text | users への登録時に一意性を再確認する |
| email_enc | bytea | |
| key_version | int | |
| email_verified_at | timestamptz | NULL 可 |
| expires_at | timestamptz | 1時間 |

## email_otps

| 列 | 型 | 制約・説明 |
|---|---|---|
| id | uuid | 主キー |
| purpose | enum | `registration`、`recovery`、`email_change` |
| subject_id | uuid | pending_registrations または users の ID |
| new_email_enc | bytea | NULL 可。`email_change` のみ |
| code_hmac | bytea | 平文は保存しない |
| attempts | int | 上限5回 |
| expires_at | timestamptz | 10分 |
| consumed_at | timestamptz | NULL 可 |

ルール: 同じ `purpose` と `subject_id` で有効なコードは3件までとし、超過時は最も古いものを無効に
する。検証は有効な全件と照合し、失敗は全件の `attempts` に加算する。

## diaries

| 列 | 型 | 制約・説明 |
|---|---|---|
| id | uuid | 主キー |
| user_id | uuid | users 参照、CASCADE |
| diary_date | date | `(user_id, diary_date)` で一意。UTC+14 の当日以前 |
| content_enc | bytea | `{ body, weather }` の暗号文 |
| image_enc | bytea | WebP、長辺1600px 以下 |
| key_version | int | |
| created_at, updated_at | timestamptz | |

検証: `body` は1〜400文字(書記素単位)。`weather` は `sunny`、`cloudy`、`rainy`、`snowy` のいずれか。

インデックス: `(user_id, diary_date DESC)`。`image_enc` は一覧の取得では読み込まない。

## follows

| 列 | 型 | 制約・説明 |
|---|---|---|
| follower_id | uuid | 主キーの一部、users 参照、CASCADE |
| followee_id | uuid | 主キーの一部、users 参照、CASCADE |
| status | enum | `pending` または `approved` |
| created_at, approved_at | timestamptz | |

検査制約: `follower_id <> followee_id`

状態遷移:

```text
(なし) → pending   申請
pending → approved 相手が承認
pending → (なし)   取り消し、拒否、ブロック
approved → (なし)  解除、フォロワーの削除、ブロック
```

## blocks

| 列 | 型 | 制約・説明 |
|---|---|---|
| blocker_id | uuid | 主キーの一部、users 参照、CASCADE |
| blocked_id | uuid | 主キーの一部、users 参照、CASCADE |
| created_at | timestamptz | |

ルール: ブロックと同じトランザクションで、両方向の `follows` を削除する。

## rate_limits

| 列 | 型 | 制約・説明 |
|---|---|---|
| bucket | text | 主キーの一部。IP や ID は HMAC 化する |
| window_start | timestamptz | 主キーの一部 |
| count | int | |

## 閲覧権限

閲覧条件は SQL の述語 `viewableOwnerCondition(viewerId)` として1箇所で定義する。
`canViewDiaries(viewer, owner)` と一覧の取得は、どちらもこの述語を使う。次の場合のみ閲覧できる。

- `viewer` と `owner` が同じである
- または次のすべてを満たす
  - `owner.visibility = public`
  - `follows` に `viewer → owner` の `approved` が存在する
  - どちらの方向にも `blocks` が存在しない

`viewer` が未ログインの場合は常に false とする。

## 期限切れデータの削除

サーバーが1時間ごとに、期限切れの `sessions`、`webauthn_challenges`、`pending_registrations`、
`email_otps`、`rate_limits` を削除する。
