---

description: "手書きの絵日記帳風 UI の実装タスク"
---

# Tasks: 手書きの絵日記帳風 UI

**Input**: Design documents from `/specs/002-handwritten-diary-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/diary-page-ui.md, quickstart.md

**Tests**: 憲章 V(TDD、NON-NEGOTIABLE)により必須。各タスクのテストを先に書き、失敗を確かめてから実装する。

**Organization**: ユーザーストーリーごとに分け、それぞれ単独で実装とテストができるようにする。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行して進められる(別のファイルで、未完了のタスクに依存しない)
- **[Story]**: 対応するユーザーストーリー(US1、US2、US3)
- パスはリポジトリのルートからの相対パス(npm workspaces: `apps/web`、`apps/server`、`packages/shared`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 書体の依存関係の追加と、決定の記録

- [X] T001 `npm install -w @diary/web @fontsource/klee-one@5.3.1` で書体パッケージを追加し、`apps/web/package.json` と `package-lock.json` を更新する。`npm audit` で脆弱性が0件であることを確かめる
- [X] T002 [P] ADR を `docs/adr/0006-handwriting-font.md` に書く。内容: Klee One(OFL-1.1)の採用、`@fontsource` の `unicode-range` 分割ファイルを自サービスから配信すること、Google Fonts を使わない理由(憲章 III、CSP `font-src 'self'`)、Regular のみとすること(research.md §1、§2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 記入画面(US1)と表示画面(US2)が共通で使う、日付の整形、行数の計算、ページの部品(CSS は US1 のテストの後に T011 で作る)

**⚠️ CRITICAL**: このフェーズが終わるまで、ユーザーストーリーの作業を始めない

- [X] T003 [P] `formatDiaryDay` のテストを `apps/web/tests/dates.test.ts` に書き、失敗を確かめる。確かめる内容は次のとおり。
  - `2026-11-08` → `11月 8日(日)`、`2026-01-05` → `1月 5日(月)`。月と日を0で埋めない
  - 閏日 `2028-02-29` → `2月 29日(火)`
  - 既存の `formatJapaneseDate`(`2026-11-07` → `2026年11月7日(土)`)が変わらない
- [X] T004 [P] `ruledHeight(contentHeight, gap)` のテストを `apps/web/tests/ruled-lines.test.ts` に書き、失敗を確かめる。確かめる内容は次のとおり。
  - 結果が `max(8 × gap, ceil(contentHeight / gap) × gap)` になる(例: gap=32 で contentHeight=0 → 256、256 → 256、257 → 288、600 → 608)
  - `gap` が0以下のときは例外を投げる(憲章 VIII)
- [X] T005 `formatDiaryDay(date: string): string` を `apps/web/src/lib/dates.ts` に追加する。曜日の計算を `formatJapaneseDate` と共通の内部関数にまとめ(DRY)、T003 を通す
- [X] T006 [P] `ruledHeight` と最小行数の定数 `MIN_RULED_LINES = 8` を、新しいファイル `apps/web/src/lib/ruled-lines.ts` に実装し、T004 を通す
- [X] T007 `DiaryPage` の部品のテストを `apps/web/tests/diary-page.test.tsx` に書き、失敗を確かめる。確かめる内容は次のとおり(contracts/diary-page-ui.md の構成)。
  - `article.diary-page` の中に、上から `figure.diary-page__picture`、`div.diary-page__meta`、`div.diary-page__body` が並ぶ
  - `meta` の中で、日付欄(`.diary-page__day`)が天気欄(`.diary-page__weather`)より前にある
  - 渡した `picture`、`day`、`weather`、`body` の内容が、それぞれの区画に入る
- [X] T008 `DiaryPage` を `apps/web/src/components/DiaryPage.tsx` に実装し、T007 を通す。
  - 引数は `picture`、`day`、`weather`、`body`(いずれも ReactNode)と、外側の見出し用の `heading`(任意)
  - 構成だけを定め、入力か表示かは呼び出し側に任せる(research.md §7)
**Checkpoint**: 日付の整形、行数の計算、ページの部品ができ、`npm run test` が通る

---

## Phase 3: User Story 1 - 絵日記帳のページに書くように記入する (Priority: P1) 🎯 MVP

**Goal**: 記入画面と編集画面を、絵の枠、日付欄と天気欄、罫線の横書きの文章欄が並ぶページにする

**Independent Test**: ログインして `/diaries/new` を開き、ページの構成が順に並ぶこと、文章が横書きで罫線に乗ること、9行目で罫線が増えること、保存できることを確かめる

### Tests for User Story 1 ⚠️

> 先に書き、失敗を確かめてから実装する

- [X] T009 [P] [US1] `apps/web/tests/diary-editor.test.tsx` を書き換え、失敗を確かめる。縦書きのクラス(`vertical-text`)の確認は、仕様の変更(001 の FR-010 を 002 の FR-006 で置き換え)により削除する。代わりに次を確かめる。
  - 記入画面が `DiaryPage` の構成(絵の枠 → 日付欄と天気欄 → 文章欄)になる
  - 日付欄に当日の `formatDiaryDay` が表示される
  - 「日付」の入力欄(`max` は当日)が日付欄の中にある
  - 「日付」の入力欄の値を `2026-11-03` に変えると、日付欄の文字列が `11月 3日(火)` に変わる(FR-005)
  - 未来の日付を入れて保存しようとすると「未来の日付は選べません」と表示される(001 の振る舞いのまま)
  - 年(例: `2026年`)がページの外に表示され、日付欄の中には年がない(FR-003)
  - 天気のラジオボタン4つ(晴れ、くもり、雨、雪)が日付欄と同じ行の天気欄(グループ名「天気」)にあり、1つだけ選べる
  - 「文章」の入力欄に `ruled-text` のクラスがある
  - 「絵(画像)」の選択欄が絵の枠の中にある
  - 未入力の項目の案内と、下書きの保存と復元(既存のテスト)が通り続ける
- [X] T010 [P] [US1] E2E を `e2e/diary-page.spec.ts` に作り、記入画面について次を確かめて、失敗を確かめる。ログインには `e2e/helpers/seed-session.ts` を使う。
  - (a) 区画の順番が、上から絵の枠、日付と天気の行、文章欄になる(各区画の `getBoundingClientRect().top` で比べる)
  - (b) 文章欄の `writing-mode` が `horizontal-tb` で、`line-height` と `--rule-gap` の計算値が等しい
  - (c) 空のときの文章欄の高さが `--rule-gap` の8倍
  - (d) 改行を含む9行の文章を入れると、高さが `--rule-gap` の9倍になる。文章欄の `scrollHeight` が `clientHeight` を超えない
  - (e) 400文字を入れても、文章欄の中で縦にも横にもスクロールしない
  - (f) 縦長と横長の画像を選ぶと、プレビューが絵の枠の内側に収まる
  - (g) 天気欄で「雨」を選ぶと、それだけが選ばれた状態になる

### Implementation for User Story 1

- [X] T011 [US1] ページと罫線の CSS を `apps/web/src/styles.css` に追加する(research.md §3、§6)。確かめるテストは T010 と T016。T012 で記入画面が使うまで、この CSS はどの画面にも当たらない(憲章 V の順序を保つ)。
  - **カード**: `.diary-page` は角の丸い薄い灰色(`#e6e6e6`)のカード、`.diary-page__sheet` は2pxの黒い枠線。虹色の縁取りは入れない(FR-013)
  - **絵の枠**: `.diary-page__picture` は縦横比 4:3 で、中の画像は `object-fit: contain`
  - **日付と天気の行**: `.diary-page__meta` で、日付欄と天気欄を縦の線で区切って左右に並べる
  - **文章欄**: `.ruled-text` で、行の高さと罫線の間隔を `--rule-gap` の1つの変数で定める
    - `line-height` と罫線の間隔に `--rule-gap` を使う
    - 点線は2層のグラデーションで描く
    - `background-origin: content-box`
    - `min-height: calc(var(--rule-gap) * 8)`
    - `writing-mode: horizontal-tb`
    - 罫線の位置は `--rule-offset` で文字の下端に合わせる。罫線の位置だけを動かし、行の間隔は変えない(SC-001)
  - **配色**: ページの文字は `#222` に固定し、ダークモードでも変えない(FR-014)
- [X] T012 [US1] `apps/web/src/features/diary/DiaryEditor.tsx` を `DiaryPage` で組み立て直す(contracts/diary-page-ui.md の記入画面)。
  - **絵の枠**: 画像のプレビュー、または「絵を選んでください」の空の枠と、「絵(画像)」の選択欄を置く
  - **日付欄**: `formatDiaryDay(date)` の文字列の上に、ラベル「日付」の `input type="date"` を透明にして重ねる。欄を押したら `showPicker()` を呼ぶ(選択画面が開くことは自動のテストで確かめられないため、quickstart の手動確認(3)で確かめる)。`max` は当日で、編集時は無効
  - **天気欄**: `fieldset` に見出し「天気」を付け、ラジオボタン4つを置く
  - **文章欄**: `textarea`(ラベル「文章」、クラス `ruled-text`)と残りの文字数を置く
  - **年**: ページの外の見出し(「絵日記を書く」「絵日記を編集」)の近くに置く
  - **キーボードの移動順**: 画像 → 日付 → 天気 → 文章 → 保存
- [X] T013 [US1] `DiaryEditor.tsx` で、文章の入力と、下書きや編集内容の読み込みのたびに、`textarea` の高さを `ruledHeight(scrollHeight, --rule-gap の計算値)` に合わせる(research.md §4)。`--rule-gap` を読み取れないときはエラーとして表示し、処理を続けない(憲章 VIII)
- [X] T014 [US1] T009 と T010 の US1 部分(a〜g)が通ることを確かめる。`e2e/accessibility.spec.ts` のキーボードだけで書くテストと、`e2e/diary.spec.ts` も通ることを確かめ、新しい移動順に合わせて必要なら操作を直す(ラベルは変えない)

**Checkpoint**: 記入と編集が新しいページでできる(MVP)

---

## Phase 4: User Story 2 - 書いた絵日記を同じページの見た目で読む (Priority: P1)

**Goal**: 表示画面、みんなの日記、相手のページで、絵日記を記入画面と同じページの見た目で表示する

**Independent Test**: 保存済みの絵日記と、001 の縦書きの画面で作った既存の絵日記を開き、記入画面と同じ構成、書体、横書きの罫線で表示されることを確かめる

### Tests for User Story 2 ⚠️

- [X] T015 [P] [US2] 表示のテストを `apps/web/tests/diary-view.test.tsx` に新しく書き、失敗を確かめる。`DiaryCard` について次を確かめる。
  - `DiaryPage` の構成になる
  - 外の見出しに「2026年11月8日(日)」が表示され、日付欄に「11月 8日(日)」が表示される
  - 天気欄に見出し「天気」と天気の名前が表示され、アイコンは `aria-hidden` になる
  - 文章が `ruled-text` の段落(名前「文章」)に、改行を保って文字として表示される(`<b>` などの HTML が解釈されない)
  - 画像の代替テキストが「〇年〇月〇日(〇)の絵」になる
- [X] T016 [P] [US2] `e2e/diary-page.spec.ts` に表示画面のテストを追加し、失敗を確かめる。確かめる内容は次のとおり。
  - (h) 保存後の表示画面が、記入画面と同じ区画の順番と罫線(`--rule-gap` が同じ)になる
  - (i) 改行を含む同じ文章で、記入画面の `textarea` と表示画面の段落の行数(高さ ÷ `--rule-gap`)が一致する
  - (j) DB に直接作った既存の絵日記を、横書きのページで表示できる。`e2e/helpers/seed-session.ts` に、暗号化した絵日記を作る `seedDiary` を追加する
  - (k) フォロワーとして、みんなの日記の一覧と相手のページでも同じページの見た目になる
  - (l) 表示画面で、改行と折り返しを含む400文字の文章について、各行の文字の下端と罫線の位置の差が `--rule-gap` の1割以内になる(SC-001)。
    - 各行の文字の位置は、段落の文字の範囲(Range)の `getClientRects()` で行ごとに取る。
    - k 行目の罫線は、段落の内容の上端から `k × --rule-gap` に `--rule-offset` を加えた位置にある。
    - 測る場所を表示画面にするのは、入力欄の中の文字の位置はブラウザから取れないため。記入画面と行数が同じことは (i) で確かめる。

### Implementation for User Story 2

- [X] T017 [US2] `apps/web/src/features/diary/DiaryView.tsx` の `DiaryCard` を `DiaryPage` で作り直し、T015 と T016 を通す。
  - **年と日付**: 外の見出しに `formatJapaneseDate`、日付欄に `formatDiaryDay` を表示する
  - **天気欄**: アイコン(`aria-hidden`)と天気の名前を表示する
  - **文章欄**: `p.ruled-text`(`aria-label="文章"`)に文章を文字として表示する
  - **書いた人**: ニックネームはページの外の見出しに置く
  - `apps/web/src/features/social/DiaryList.tsx` は `DiaryCard` を使い続ける。変更しない
- [X] T018 [US2] 縦書きの部品 `apps/web/src/components/VerticalPage.tsx` を削除し、`apps/web/src/styles.css` から縦書きの CSS(`.manuscript`、`.vertical-text`、`--cell`)と、使わなくなった `.diary-card`、`.diary-header`、`.diary-image` を削除する。`npm run typecheck` と `npm run lint` が通ることを確かめる

**Checkpoint**: 記入と表示が同じページの見た目になり、US1 と US2 のテストが通る

---

## Phase 5: User Story 3 - どの端末でも手書きらしい見た目で読み書きする (Priority: P2)

**Goal**: 手書き風の書体を自サービスから配信し、360px、ダークモード、拡大、書体にない文字でも崩れずに表示する

**Independent Test**: 幅360pxと1280pxで記入画面と表示画面を開き、Klee One で表示され、外部への通信がなく、横スクロールが起きないことを確かめる

### Tests for User Story 3 ⚠️

- [X] T019 [P] [US3] `e2e/diary-page.spec.ts` に次のテストを追加し、失敗を確かめる。
  - (m) 文章欄、日付欄、天気欄の `font-family` の先頭が `"Klee One"` で、`document.fonts.check('16px "Klee One"', 'あ')` が読み込み後に真になる
  - (n) 記入画面と表示画面を開いている間のすべての通信の宛先が `baseURL` と同じオリジン(`page.on('request')` で集める)。書体ファイル(`.woff2`)を1つ以上取得している
  - (o) 幅360pxで、記入画面(400文字入力)と表示画面に横スクロールがない。はみ出した要素を一覧で表示する、既存の `overflowingElements` の仕組みを使う
  - (p) `colorScheme: 'dark'` で開いても、ページの地の色が `rgb(230, 230, 230)` で、文字の色が `rgb(34, 34, 34)` のまま
  - (q) 絵文字(😀)と記号(♪)を含む文章が欠けずに表示される。段落の `textContent` が入力と一致し、文字の幅が0でない。□(代わりの書体がない文字)にならないことは自動では判定できないため、quickstart の手動確認(15)を正式な確認とする
- [X] T020 [P] [US3] `e2e/performance.spec.ts` に、Chromium で回線を下り10Mbps、遅延40msに絞った状態で、絵日記の表示画面を開いてから文章が Klee One で表示されるまでの時間を測るテストを追加し、失敗を確かめる(SC-004)。
  - 回線は、Playwright から Chromium の開発者向け機能(`Network.emulateNetworkConditions`)を使って絞る
  - 終了の判定は `document.fonts.check('16px "Klee One"', <表示中の文章>)` が真になった時点とし、2秒以内であること
  - 書体のキャッシュがない新しいブラウザのコンテキストで測る
  - 回線を絞れるのは Chromium だけなので、ほかのブラウザでは実行しない

### Implementation for User Story 3

- [X] T021 [US3] `apps/web/src/main.tsx` で `@fontsource/klee-one/400.css` を読み込む。`apps/web/src/styles.css` の `.diary-page` の書体を次のように指定する(research.md §2)。
  - `'Klee One', 'Hiragino Maru Gothic ProN', 'Yu Gothic', 'Noto Sans CJK JP', sans-serif`
  - 行の高さは `--rule-gap` の固定値のまま
- [X] T022 [US3] `npm run build -w @diary/web` で、書体ファイルが `apps/web/dist/assets/` に出力されることを確かめる。本番の Docker イメージで、CSP `font-src 'self'` のまま書体が読み込まれることを確かめる。T019 と T020 を通す

**Checkpoint**: すべてのユーザーストーリーが単独で動く

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T023 [P] `e2e/vertical-writing.spec.ts` を削除する。理由(001 の FR-010 を 002 の FR-006 で置き換えたため。確認していた内容は `e2e/diary-page.spec.ts` の (b)、(e)、(o) に引き継ぐ)をコミットのメッセージに書く(憲章 V)
- [X] T024 [P] `specs/001-picture-diary-service/spec.md` の FR-010 と、縦書きに触れる受け入れシナリオと Edge Cases に、「002-handwritten-diary-ui の FR-006 で横書きに置き換え」と注記する
- [X] T025 [P] `README.md` と `apps/web/src/features/legal/PrivacyPage.tsx` に、書体を自サービスから配信し、外部サービスへの通信がないことを必要に応じて書く。プライバシーの説明画面のテスト `apps/web/tests/privacy.test.tsx` を先に更新する
- [X] T026 [P] `e2e/accessibility.spec.ts` の自動検査(axe)の対象に、絵日記の表示画面(`/users/:handle/diaries/:date`。テストデータで作った絵日記)を加え、重大な違反がないことを確かめる(FR-014 のコントラスト)
- [X] T027 `npm run verify` を実行し、型検査、lint、テスト、`npm audit`、秘密情報の検査がすべて通ることを確かめる
- [ ] T028 E2E 全体を、macOS(Chromium、WebKit、幅360px)と、CI と同じ Linux の Playwright コンテナ(Firefox を含む全ブラウザ)で実行し、すべて通ることを確かめる
- [ ] T029 `specs/002-handwritten-diary-ui/quickstart.md` の手動確認(1〜16)を行う。Safari と Edge の実機での書体の確認(14)は利用者が行う。拡大200%(12)と書体の読み込み中の行のずれは、自動のテストを作らず、この手動確認で確かめる(行の高さを固定して対策済み。research.md §2)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし
- **Foundational (Phase 2)**: Setup の後。すべてのユーザーストーリーの前提
- **US1 (Phase 3)**: Foundational の後
- **US2 (Phase 4)**: Foundational と、US1 の T011(ページと罫線の CSS)の後。それ以外は US1 と独立していて、並行して進められる
- **US3 (Phase 5)**: Foundational の後。テストは US1 と US2 の画面を使うため、どちらかが終わった後に始めるのが効率的
- **Polish (Phase 6)**: すべてのストーリーの後

### Within Each User Story

- テストを先に書いて失敗を確かめ、実装して通す
- `DiaryEditor.tsx` の T012 と T013 は同じファイルのため、順に行う
- `e2e/diary-page.spec.ts` の T010、T016、T019 は同じファイルのため、順に追加する
- `apps/web/src/styles.css` の T011、T018、T021 は同じファイルのため、順に行う

### Parallel Opportunities

- T002 は T001 と並行できる
- T003 と T004、T006 は並行できる
- US1 の T009 と T010、US2 の T015 と T016 は、それぞれ並行できる
- Polish の T023、T024、T025、T026 は並行できる

---

## Parallel Example: User Story 1

```text
Task: "T009 [US1] 記入画面の単体テストを apps/web/tests/diary-editor.test.tsx に書き換える"
Task: "T010 [US1] 記入画面の E2E を e2e/diary-page.spec.ts に作る"
```

## Parallel Example: Foundational

```text
Task: "T003 formatDiaryDay のテストを apps/web/tests/dates.test.ts に書く"
Task: "T004 ruledHeight のテストを apps/web/tests/ruled-lines.test.ts に書く"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1(Setup)と Phase 2(Foundational)を終える
2. Phase 3(US1)を終え、記入画面が新しいページになったことを確かめる
3. この時点では、表示画面はまだ縦書きのまま。US1 だけでは公開しない

### Incremental Delivery

1. Setup + Foundational → 部品の土台
2. US1 → 記入画面(MVP)
3. US2 → 表示画面も同じ見た目。ここで記入と表示がそろい、公開できる
4. US3 → 手書き風の書体と、端末ごとの品質
5. Polish → 縦書きの名残の削除と、全ブラウザでの確認

---

## Notes

- 保存するデータ、API、DB、エクスポートの形式は変えない(data-model.md)
- 縦書きのテストの削除と書き換えは、仕様の変更によるもの。理由を記録する(憲章 V)
- 各タスクまたは意味のあるまとまりごとにコミットする
