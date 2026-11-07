# Research: 絵日記公開サービス

バージョンは 2026-11-07 時点の npm と nodejs.org で確認した。正確な版はロックファイルで固定する。

## 1. アプリケーション構成

- **Decision**: Vite でビルドする React の SPA と、Hono の JSON API を Node.js の1プロセスから
  同じ配信元で提供する。
- **Rationale**: 全画面がログイン後の利用で SEO が不要なため、SSR は必要ない。SPA の静的ファイル
  にはインラインスクリプトがなく、`script-src 'self'` の CSP を単純に適用できる。
- **Alternatives considered**: Next.js は SSR が不要なうえ、インラインスクリプトのために nonce と
  動的レンダリングが必要になる。API と SPA の別配信元は CORS が増える。

## 2. 言語とランタイム

- **Decision**: TypeScript strict と Node.js 26 LTS(v26.13.0)を使用する。
- **Rationale**: ブラウザとサーバーで言語と検証スキーマを共有でき、原則 VII に合う。26 は現行の
  LTS で、サポート期間が最も長い。
- **Alternatives considered**: Node.js 24 LTS は新しい LTS より先にサポートが終わる。
- **Note**: TypeScript の版は typescript-eslint の対応範囲内で最新を選ぶ。実装の開始時に確認する。

## 3. データストアと画像の保存

- **Decision**: PostgreSQL 18 に画像を含むすべてのデータを保存する。ORM は Drizzle とする。
- **Rationale**: 再エンコード後の画像は1件1MB以下で、初期規模なら DB で扱える。トランザクションで
  削除でき、バックアップも1つで済み、公開 URL も生じないため権限判定を通さない配信を防げる。
- **Alternatives considered**: オブジェクトストレージは依存と権限設定が増え、DB との削除の整合も
  必要になる。容量が問題になった時点で新しい ADR で移行する。

## 4. 保存時の暗号化

- **Decision**: `node:crypto` の AES-256-GCM でアプリケーション層の暗号化を行う。本文と天気は
  1つの暗号文にまとめ、画像とメールアドレスは個別に暗号化する。AAD にレコードの種別と ID を含め、
  鍵のバージョンを保存する。鍵は環境変数で渡し、DB には置かない。
- **Rationale**: DB やバックアップだけが漏えいしても内容を読めず、暗号文の入れ替えも検出できる。
- **Alternatives considered**: ディスクの暗号化のみでは、DB のダンプや SQL インジェクションから
  守れない。利用者が鍵を持つ方式は Clarifications で不採用となった。

## 5. パスキー

- **Decision**: SimpleWebAuthn を使用し、Discoverable Credential と User Verification を必須と
  する。ログインでは `allowCredentials` を空にし、入力された ID と認証情報の所有者が一致する
  場合のみ成功とする。
- **Rationale**: 仕様どおり ID を入力させつつ、認証オプションから ID の存在が分からない。
- **Alternatives considered**: `allowCredentials` の指定は、応答の差から ID を列挙される。

## 6. セッション

- **Decision**: DB に保存するサーバー側セッションを使う。Cookie は `__Host-session` で `HttpOnly`、
  `Secure`、`SameSite=Strict` とし、有効期間は30日とする。復旧中は10分有効の制限付きセッションと
  する。退会や機密性の高い操作の前には、5分有効のパスキーの再認証を求める。
- **Rationale**: 即時に失効でき、復旧時に他のセッションも無効にできる。
- **Alternatives considered**: JWT は失効の仕組みが別途必要になる。

## 7. ワンタイムパスワードとメール

- **Decision**: 8桁の数字を HMAC-SHA-256 で保存し、定数時間で比較する。送信は SMTP(Nodemailer)
  で行い、配信事業者は環境変数で切り替える。復旧のメール送信は応答を待たずに実行し、処理時間から
  ID が分からないようにする。登録時の送信は待機し、失敗を表示する。
- **Rationale**: SMTP は事業者に依存しない。キューは初期規模では不要である。
- **Alternatives considered**: 事業者固有の API はロックインが生じる。
- **Open**: 配信事業者はデプロイの前に選定し、ADR に記録する。

## 8. 回数制限

- **Decision**: PostgreSQL の固定ウィンドウのカウンターで制限する。

| 対象 | 上限 |
|---|---|
| ログイン検証 | IP ごと 10回/分、ID ごと 20回/時 |
| ワンタイムパスワードの送信 | ID ごと 3回/時、IP ごと 10回/時 |
| ワンタイムパスワードの検証 | 1コードにつき5回 |
| 登録の開始 | IP ごと 10回/時 |
| ユーザーの検索 | 利用者ごと 30回/分 |

- **Rationale**: 再起動後も維持され、Redis を追加せずに済む。

## 9. 画像処理

- **Decision**: sharp で JPEG、PNG、WebP を読み込み、向きを反映して WebP に再エンコードする。
  絵日記は長辺1600px、プロフィール画像は400px とし、入力は5,000万ピクセルまでとする。
- **Rationale**: 再エンコードで実際に画像であることを検証でき、位置情報などのメタデータも確実に
  除去できる。
- **Alternatives considered**: メタデータのみの削除は、非標準の領域や不正な形式の見落としがある。

## 10. 縦書きの UI

- **Decision**: CSS の `writing-mode: vertical-rl` と標準の `<textarea>` を使い、原稿用紙風の枠を
  CSS の背景で描く。文字数は `Intl.Segmenter` で書記素単位に数える。
- **Rationale**: 標準機能だけで IME、選択、アクセシビリティを維持できる。
- **Alternatives considered**: `contenteditable` や Canvas は、IME と支援技術の対応を自作する必要が
  ある。
- **Risk**: ブラウザ間で挙動が異なる場合があるため、主要4ブラウザの E2E で確認する。

## 11. 下書きの保持

- **Decision**: IndexedDB に利用者ごとの下書きを1件保持する。入力後500msで書き込み、保存の完了時と
  ログアウト時に消去する。
- **Rationale**: 画像の Blob を保持でき、タブを閉じても失われない(FR-017)。
- **Alternatives considered**: localStorage は画像に容量が足りない。

## 12. エクスポートとインポート

- **Decision**: エクスポートはサーバーが ZIP をストリーミングで生成する。インポートはブラウザが
  ZIP を展開し、通常の作成 API を1件ずつ呼び出す。同じ日付が既にある場合は上書きせずスキップし、
  成功、スキップ、失敗の件数を表示する。形式は `manifest.json`(`schemaVersion: 1`)と画像とする。
- **Rationale**: インポートが通常の検証をすべて通り、サーバーが ZIP 爆弾に晒されない。既存の日記を
  上書きしないため、データを失わない。
- **Alternatives considered**: サーバーでの展開は解凍の防御が別途必要になる。

## 13. 日付とタイムゾーン

- **Decision**: 日付は利用者のブラウザの現地日付で扱う。サーバーは UTC+14 の現在日付より後を拒否
  する。
- **Rationale**: 時差のある利用者が当日の日記を書ける。

## 14. バックアップと削除

- **Decision**: 削除と退会は DB から即時に実行する。バックアップの保持は最長30日とし、その後に
  データは完全に消える。利用者には利用開始前に説明する。
- **Rationale**: 復旧能力と削除の確実性を両立する。暗号化により、バックアップ内のデータも保護される。

## 15. 運営者のアクセスの記録

- **Decision**: アプリに運営者向けの閲覧機能は設けない。本番 DB の接続と鍵へのアクセスは個別の権限に
  限定し、ホスティング側の監査ログで記録する。
- **Rationale**: 閲覧経路を作らないことが最も単純で安全である(FR-044)。
- **Open**: 監査ログを提供することを、ホスティング先の選定条件とする。

## 16. テストと品質ゲート

- **Decision**: 単体と結合は Vitest、UI は Testing Library、E2E は Playwright を使う。統合テストは
  実 PostgreSQL に接続する。静的解析は `tsc --noEmit`、ESLint の型情報付きルール。`npm run verify`
  でテスト、lint、型検査、`npm audit` を実行し、`.githooks/pre-push` と GitHub Actions で強制する。
- **Rationale**: 権限と暗号化はモックでは検証できない。フックは依存を増やさず用意できる。
- **Note**: パスキーは Chromium の仮想認証器で自動テストする。Firefox と Safari のパスキーは手動で
  確認する。

## 17. ホスティング

- **Decision**: Docker コンテナ1台とマネージド PostgreSQL の構成を前提とし、具体的な事業者は
  デプロイの前に選定する。
- **Rationale**: 実装に影響しない。TLS、監査ログ、自動バックアップ、鍵の秘匿を条件とする。
