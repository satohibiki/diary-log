# ADR-0001: アプリケーション構成と技術スタック

- **Status**: 提案中
- **Date**: 2026-11-07

## 背景

絵日記公開サービスには、ログイン後の画面のみを持つ Web アプリと API が必要である。憲章は厳格な CSP
とシンプルな構成を求めている。

## 決定

TypeScript の React SPA(Vite)と Hono の API を、Node.js 26 LTS の1プロセスから同じ配信元で
提供する。npm workspaces を使い、検証スキーマを `packages/shared` で共有する。

## 検討した代替案

- Next.js: SSR が不要で、インラインスクリプトのための nonce が必要になる。
- API と SPA の別配信元: CORS の設定が増える。

## 影響

SEO には対応しない。Node.js の導入が開発環境に必要である。
