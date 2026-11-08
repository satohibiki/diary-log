# Implementation Plan: 手書きの絵日記帳風 UI

**Branch**: `002-handwritten-diary-ui` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-handwritten-diary-ui/spec.md`

## Summary

絵日記の記入画面と表示を、紙の絵日記帳の1ページに近いカードに作り替える。

- **ページの構成**: 上から絵の枠、日付欄と天気欄、点線の罫線が並ぶ横書きの文章欄。
- **文章欄**: 縦書きのマス目をやめ、最初は8行で、文章の量に合わせて行が増える。
- **書体**: 手書き風の書体 Klee One を自サービスから配信して使う。

変更は Web アプリ(`apps/web`)の表示だけで、API、DB、保存形式、エクスポートの形式は変えない。

記入と表示のページ構成は、新しい共通の部品 `DiaryPage` で1か所にまとめる。罫線と行の高さは、同じ CSS 変数で定める。詳しくは [research.md](./research.md) を参照。

## Technical Context

**Language/Version**: TypeScript 6.0(strict)、Node.js 26(001 と同じ)

**Primary Dependencies**:
- 既存: React 19、react-router 8、Vite 8
- 追加: `@fontsource/klee-one` 5.3(書体ファイルと `@font-face` の CSS のみ。実行するコードを含まない)

**Storage**: 変更なし(PostgreSQL。保存する項目は 001 のまま)

**Testing**:
- Vitest(jsdom)で、日付欄の整形と行数の計算をテストする。
- Playwright で、レイアウト、罫線の位置、書体、外部への通信の有無、360px での横スクロールを確かめる。

**Target Platform**: Chrome、Edge、Firefox、Safari の最新安定版。幅360px以上。

**Project Type**: Web アプリ(既存の npm workspaces: `apps/web`、`apps/server`、`packages/shared`)

**Performance Goals**:
- 絵日記の表示画面が、書体の読み込みを含めて、下り10Mbps、遅延40msの回線で2秒以内に読める状態になる(SC-004)。
- 一般的な文章で、書体の取得は約280KB に収める。

**Constraints**:
- CSP(`font-src 'self'`、`img-src 'self' blob:`)を変えない。
- 外部への通信をしない(SC-006)。
- 罫線と文字のずれは、行の高さの1割以内にする(SC-001)。
- 文字と背景のコントラスト比は 4.5:1 以上にする。

**Scale/Scope**:
- 対象の画面は5つ: 記入、編集、表示、みんなの日記、相手のページ。
- 部品の追加1つ(`DiaryPage`)、部品の削除1つ(`VerticalPage`)。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. セキュリティ最優先 | PASS | CSP を変えない。追加する依存関係は書体ファイルのみ。`npm audit` と lockfile の整合性ハッシュで確認する。脅威と対策は research.md §8 |
| II. サーバー保存とデータの最小化 | PASS | 保存するデータと場所は変えない。端末には下書きのみ(既存のまま) |
| III. プライバシー保護 | PASS | 書体を自サービスから配信し、外部サービスへの通信をしない(FR-011、SC-006)。E2E で確かめる |
| IV. データの保全と可搬性 | PASS | 保存形式とエクスポートの形式は変えない。既存の絵日記をそのまま表示できることを確かめる(US2-3、憲章の開発ワークフロー「既存データでの確認」) |
| V. TDD | PASS | 日付欄の整形、行数の計算、レイアウトの E2E を先に書き、失敗を確かめてから実装する。縦書きのテストの置き換えは、仕様の変更による。理由を記録する(research.md §9) |
| VI. KISS・YAGNI | PASS | 書体は Regular の1種類のみ。日付の選択はネイティブの入力欄を使う。罫線は CSS だけで描く |
| VII. DRY | PASS | ページの構成は `DiaryPage` の1か所、行の高さと罫線の間隔は1つの CSS 変数、曜日の計算は `dates.ts` の1か所で定める |
| VIII. 明示的なエラー処理 | PASS | 書体の切り替えは、仕様で求めた表示の振る舞い(US3-3、FR-012)で、エラーを隠す処理ではない(research.md §2) |
| Web プラットフォーム要件 | PASS | 4ブラウザ、360px で横スクロールなし、キーボードで操作でき、WCAG 2.1 AA を満たす(FR-014、FR-017、FR-018) |
| 開発ワークフロー(ADR) | PASS | 書体の追加と配信方法を ADR-0006 に記録する |

**再確認(Phase 1 の設計後)**: すべて PASS。違反はなく、Complexity Tracking は不要。

## Project Structure

### Documentation (this feature)

```text
specs/002-handwritten-diary-ui/
├── plan.md              # この計画
├── research.md          # Phase 0: 書体、罫線、行数、日付欄、配色の決定
├── data-model.md        # Phase 1: 表示用のモデル(保存するデータは変えない)
├── quickstart.md        # Phase 1: 動作確認の手順
├── contracts/
│   └── diary-page-ui.md # Phase 1: ページの構成とアクセシビリティの約束
└── tasks.md             # Phase 2(/speckit-tasks で作成)
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── components/
│   │   ├── DiaryPage.tsx         # 新規: ページ(カード)の構成を1か所で定める
│   │   └── VerticalPage.tsx      # 削除
│   ├── features/diary/
│   │   ├── DiaryEditor.tsx       # DiaryPage を使って記入画面を組み立て直す。文章欄の高さを自動で合わせる
│   │   └── DiaryView.tsx         # DiaryCard を DiaryPage で表示する(みんなの日記、相手のページも同じ部品)
│   ├── lib/
│   │   ├── dates.ts              # formatDiaryDay(「11月 8日(日)」)を追加し、曜日の計算を共通にする
│   │   └── ruled-lines.ts        # 新規: 行数から文章欄の高さを求める純粋な関数(最小8行)
│   ├── main.tsx                  # @fontsource/klee-one/400.css を読み込む
│   └── styles.css                # 縦書きの CSS を削除し、ページ、罫線、書体の CSS を追加
└── tests/
    ├── dates.test.ts             # formatDiaryDay
    ├── ruled-lines.test.ts       # 行数と高さの計算
    ├── diary-page.test.tsx       # DiaryPage の区画の構成(新規)
    ├── diary-editor.test.tsx     # 縦書きの確認を、ページ構成と横書きの確認に置き換える
    └── diary-view.test.tsx       # 表示のページ構成(新規)

e2e/
├── diary-page.spec.ts            # 新規: レイアウト、罫線の位置、行の追加、書体、外部への通信、360px
└── vertical-writing.spec.ts      # 削除(diary-page.spec.ts に置き換え)

docs/adr/0006-handwriting-font.md # 新規: 書体の選定と自サービスからの配信
specs/001-picture-diary-service/spec.md  # FR-010 に「002 の FR-006 で置き換え」と注記する
```

**Structure Decision**: 既存の npm workspaces の構成を変えない。変更は `apps/web` と E2E とドキュメントに限る。サーバーと共有パッケージは変更しない。

## Complexity Tracking

違反がないため、記載なし。
