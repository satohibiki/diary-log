# Implementation Plan: 「書く」で開く絵日記の日付を今日にする(不具合修正)

**Branch**: `003-fix-write-today-date` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-fix-write-today-date/spec.md`

## Summary

「書く」を開くと、日付欄に今日ではなく以前に開いた日の日付が出る不具合を直す。原因は3つある(詳しくは [research.md](./research.md) §1)。

1. 新規の書きかけが日付に関係なく1件だけ保持され、その日付で開く日付を置き換えていた。
2. 何も入力しなくても、開いただけで書きかけが保持されていた。
3. 新規の記入画面から「書く」へ移っても、画面が作り直されず日付が残っていた。

直し方:

- **書きかけを日付ごとに保持する**: キーを `<user>:new:<date>` に変え、開いた日付の書きかけだけを戻す。空の書きかけは保持しない。
- **開く日付を URL だけで決める**: `?date=` が正しく今日以前ならその日付、それ以外は今日にする。新規の記入画面は URL ごとに作り直す。
- **ほかの日付の書きかけを案内する**: 画面の日付以外の書きかけを、リンクの一覧で示す。
- **修正前の書きかけを移す**: 古いキー `<user>:new` を、記録された日付のキーへ移す。

変更は Web アプリ(`apps/web`)だけで、API、DB、エクスポートの形式は変えない。

## Technical Context

**Language/Version**: TypeScript 6.0(strict)、Node.js 26(001 と同じ)

**Primary Dependencies**: 既存の React 19、react-router 8、Vite 8、zod(`packages/shared` の `diaryDateSchema`)。追加なし。

**Storage**: サーバー側は変更なし。端末の IndexedDB `diary-drafts`(バージョン 1 のまま)の、新規の書きかけのキーの形を変える([data-model.md](./data-model.md))。

**Testing**:
- Vitest(jsdom、fake-indexeddb)で、書きかけの保持、空の判定、移行、日付の決め方、記入画面の振る舞いを確かめる。
- Playwright で、`page.clock` を使って日付をまたいだ「書く」の日付と、案内の表示を確かめる。

**Target Platform**: Chrome、Edge、Firefox、Safari の最新安定版。幅360px以上。

**Project Type**: Web アプリ(既存の npm workspaces: `apps/web`、`apps/server`、`packages/shared`)

**Performance Goals**: 記入画面を開く時間を、修正前から目に見えて遅くしない。書きかけの一覧はキーの範囲の読み取り1回で行う。

**Constraints**:
- 書きかけは端末にだけ保持し、同期しない(憲章 II、001)。
- 既存の書きかけの内容を失わない(憲章 IV)。
- 002 のページ(カード)の構成を変えない。案内はカードの外に置く。

**Scale/Scope**: 変更する画面は新規の記入画面1つ。変更するモジュールは `draft-store.ts`、`dates.ts`、`DiaryEditor.tsx`、`routes.tsx`。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. セキュリティ最優先 | PASS | URL の `date` は `diaryDateSchema` で検証し、不正なら今日にする。脅威と対策は research.md §10 |
| II. サーバー保存とデータの最小化 | PASS | 端末に保持するのは保存前の入力内容のみで、変えない。空の書きかけを保持しなくなり、端末に残るデータは減る |
| III. プライバシー保護 | PASS | 外部への送信なし。案内には自分の書きかけだけを出す(キーに利用者を含む) |
| IV. データの保全と可搬性 | PASS | 修正前の書きかけを移行し、移行のテストを書く(research.md §8)。別の日付の書きかけを置き換える前に確認する(§6)。エクスポートの形式は変えない |
| V. TDD | PASS | 不具合を再現する単体テストと E2E を先に加え、失敗を確かめてから直す。既存のテストの変更理由は research.md §9 に記録した |
| VI. KISS・YAGNI | PASS | IndexedDB の構造とバージョンは変えず、キーの形だけを変える。画面の作り直しは `key` で行う。依存の追加なし |
| VII. DRY | PASS | 空の判定は `isEmptyDraft`、キーの形は `draft-store.ts`、開く日付の決め方は `initialDiaryDate`、日付の形式の検証は `diaryDateSchema` の各1か所で定める |
| VIII. 明示的なエラー処理 | PASS | 不正な `date` で今日にするのは、spec の Edge Cases に定めたフォールバックで、通知が要らない理由を research.md §4 に書いた。IndexedDB の失敗と移行の失敗は、従来どおり画面のエラーとして示す |
| Web プラットフォーム要件 | PASS | 案内は `nav` とリンクで作り、キーボードと読み上げで使える。360px で横スクロールを出さない |
| 開発ワークフロー(ADR) | PASS | 端末の書きかけの保存形式(キー)の変更を ADR-0007 に記録する |

**再確認(Phase 1 の設計後)**: すべて PASS。違反はなく、Complexity Tracking は不要。

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-write-today-date/
├── plan.md              # この計画
├── research.md          # Phase 0: 原因、書きかけの分け方、日付の決め方、移行、テストの変更
├── data-model.md        # Phase 1: 書きかけのキーと規則、移行の手順
├── quickstart.md        # Phase 1: 動作確認の手順
├── contracts/
│   └── diary-editor-ui.md  # Phase 1: 新規の記入画面の URL、復元、案内、日付の変更の約束
└── tasks.md             # Phase 2(/speckit-tasks で作成)
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── lib/
│   │   ├── draft-store.ts     # 新規の書きかけを日付ごとのキーで扱う関数、isEmptyDraft、listNewDraftDates、移行を追加
│   │   └── dates.ts           # initialDiaryDate(URL の date と今日から開く日付を決める)を追加
│   ├── features/diary/
│   │   └── DiaryEditor.tsx    # 書きかけの日付で日付を置き換えない。日付ごとの保持、空なら消去、日付の変更、案内を追加
│   └── routes.tsx             # 新規の記入画面を URL ごとに作り直す(key)
└── tests/
    ├── draft-store.test.ts    # 日付ごとの保持、空の扱い、一覧、移行
    ├── dates.test.ts          # initialDiaryDate
    └── diary-editor.test.tsx  # 不具合の再現、案内、日付の変更。既存の復元テストを今日の日付に変更

e2e/
└── diary.spec.ts              # page.clock で日付をまたいだ「書く」の日付、案内からの移動

docs/adr/0007-per-date-drafts.md            # 新規: 新規の書きかけを日付ごとに保持する
specs/001-picture-diary-service/spec.md     # FR-012 と FR-017 に「003 で補足」と注記する
```

**Structure Decision**: 既存の npm workspaces の構成を変えない。変更は `apps/web`、E2E、ドキュメントに限る。サーバーと共有パッケージは変更しない(`diaryDateSchema` は既存のものを使う)。

## Complexity Tracking

違反がないため、記載なし。
