# ADR-0004: 実行時依存

- **Status**: 提案中
- **Date**: 2026-11-07

## 背景

憲章の原則 VI は、実行時依存の追加理由と、標準機能では不足する理由の記録を求めている。

## 決定

| 依存 | 必要な理由 | 標準機能では不足する理由 |
|---|---|---|
| react、react-dom、react-router | 画面の構築と遷移 | 文字列の安全な表示を手作業で保証する必要がある |
| hono、@hono/node-server | HTTP のルーティング | `node:http` にはルーティングがない |
| zod | 検証スキーマの共有 | 標準の検証機能がない |
| drizzle-orm、pg | 型付きのクエリと PostgreSQL 接続 | Node.js に PostgreSQL クライアントがない |
| @simplewebauthn/server、@simplewebauthn/browser | パスキーの検証 | WebAuthn の検証の自作は危険である |
| sharp | 画像の検証と再エンコード | Node.js に画像処理がない |
| nodemailer | SMTP の送信 | Node.js に SMTP クライアントがない |
| fflate | ZIP の生成と展開 | 標準機能では ZIP を扱えない |

ログと回数制限は依存を追加せず実装する。

## 検討した代替案

- ORM なしの `pg` のみ: クエリの型が失われ、マイグレーションの管理も自作になる。
- Redis による回数制限: データストアが増える。

## 影響

sharp はネイティブモジュールを含むため、脆弱性の更新を継続して適用する必要がある。
