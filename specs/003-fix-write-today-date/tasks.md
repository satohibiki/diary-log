---

description: "Task list for 003-fix-write-today-date"
---

# Tasks: 「書く」で開く絵日記の日付を今日にする(不具合修正)

**Input**: Design documents from `/specs/003-fix-write-today-date/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/diary-editor-ui.md, quickstart.md

**Tests**: 憲章 V(TDD、NON-NEGOTIABLE)により、すべての動きの変更でテストを先に書き、失敗を確かめてから実装する。不具合の修正では、不具合を再現して失敗するテストを先に加える。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## 共通の前提(すべてのタスク)

- 単体テストは `npm test`(Vitest、jsdom、`apps/web/tests/setup.ts` で `fake-indexeddb/auto` を読み込み済み)、E2E は `npx playwright test <file>` で実行する。
- 記入画面の単体テストは、`apps/web/tests/diary-editor.test.tsx` の既存の `renderEditor(path)`、`fillAll()`、`mockFetch` を使う。
- 日付を固定する単体テストは `vi.useFakeTimers({ toFake: ['Date'] })` と `vi.setSystemTime(new Date(2026, 10, 22, 9, 0))`(端末の現地時刻)を使い、`afterEach` で `vi.useRealTimers()` に戻す。`Date` だけを偽にして、IndexedDB と `setTimeout` は本物のまま動かす。
- E2E のログインは `e2e/diary.spec.ts` の既存の `beforeEach`(`seedUser`、`signInAs`)を使う。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 作業ブランチと記録の準備

- [X] T001 `main` から作業ブランチ `003-fix-write-today-date` を作って切り替える(`git switch -c 003-fix-write-today-date`)
- [X] T002 [P] ADR を `docs/adr/0007-per-date-drafts.md` に、`docs/adr/0006-handwriting-font.md` と同じ形式(Status、Date、背景、決定、検討した代替案、影響)で書く。内容は research.md §1〜§3、§8 のとおり。
  - 背景: 新規の書きかけが `<user>:new` の1件だけで、開く日付を置き換えていた不具合。
  - 決定: キーを `<user>:new:<YYYY-MM-DD>` にする。空の書きかけは保持しない。IndexedDB のバージョンは 1 のまま。古いキーは記入画面を開いたときに移す。
  - 代替案: 日付だけ今日に置き換える、日付が違えば捨てる、バージョンを上げて `onupgradeneeded` で移す。それぞれ不採用の理由を書く。
- [X] T003 [P] `specs/001-picture-diary-service/spec.md` の FR-012 の末尾に「(003-fix-write-today-date の FR-001、FR-002 で補足)」を、FR-017 の末尾に「(003-fix-write-today-date の FR-003〜FR-008 で補足)」を追記する

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 書きかけの保持を日付ごとに分け、開く日付を決める関数を用意する。すべてのストーリーがこれに依存する。

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests (先に書き、失敗を確かめる)

- [X] T004 [P] `apps/web/tests/draft-store.test.ts` を書き換え、失敗を確かめる。既存の4つのテストの期待(画像を含む保存と復元、利用者ごとの分離、保存後の消去、ログアウト時の全消去)は弱めず、新しい関数で書き直す。変更の理由(新規の書きかけのキーを日付ごとに分けた。003 FR-003)をファイル先頭のコメントに1行で書く。加えて次を確かめる。
  - `saveNewDraft('alice', d)` と `loadNewDraft('alice', '2026-11-22')` で、日付 `2026-11-22` の書きかけだけが戻り、`2026-11-08` の書きかけは `loadNewDraft('alice', '2026-11-08')` でしか戻らない。
  - `saveNewDraft` に空の書きかけ(`body.trim() === ''`、`weather === ''`、`image === null` のすべて)を渡すと、その日付のキーが消え、`loadNewDraft` が `null` を返す。先に空でない書きかけがあった場合も消える。
  - `isEmptyDraft`: 本文が空白と改行だけ、天気が `''`、画像が `null` なら `true`。どれか1つでも入っていれば `false`。
  - `listNewDraftDates('alice')`: alice の空でない新規の書きかけの日付を、新しい順(`['2026-11-22', '2026-11-15', '2026-11-08']`)で返す。bob の書きかけ、alice の編集の書きかけ(`saveDraft('alice', '2026-11-01', …)`)、古いキー `alice:new` は含めない。
  - `clearNewDraft('alice', '2026-11-15')` は、その日付だけを消す。
  - `migrateLegacyNewDraft('alice')`(data-model.md「修正前の書きかけの移行」):
    - 古いキー `alice:new` に空でない書きかけ(date `2026-11-08`)があれば `loadNewDraft('alice', '2026-11-08')` で同じ内容(画像を含む)が戻り、`alice:new` は消える。
    - 空なら `alice:new` は消え、新しいキーは作られない。
    - 移動先 `alice:new:2026-11-08` が既にあれば、移動先の内容が残り、`alice:new` は消える。
    - `alice:new` の `date` が正しい日付でなければ、エラーを投げ、`alice:new` は残る。
    - `alice:new` が無ければ何もしない。bob の古いキーには触れない。
  - 古いキーを作るテストでは、修正前と同じ `saveDraft('alice', 'new', …)` を使う。
- [X] T005 [P] `initialDiaryDate(param: string | null, today: string): string` のテストを `apps/web/tests/dates.test.ts` に追加し、失敗を確かめる(contracts/diary-editor-ui.md「URL」)。today を `2026-11-22` として次を確かめる。
  - `null` → `2026-11-22`
  - `'2026-11-15'` → `'2026-11-15'`、`'2026-11-22'` → `'2026-11-22'`
  - 未来 `'2026-11-23'` → `2026-11-22`
  - 不正な形式 `'2026-1-5'`、`'abc'`、`''`、実在しない `'2026-02-30'` → `2026-11-22`

### Implementation

- [X] T006 `apps/web/src/lib/draft-store.ts` に次を追加し、T004 を通す(data-model.md)。
  - 新規の書きかけのキーを作る関数 `newKey(user, date)` = `` `${user}:new:${date}` `` を1か所で定める(憲章 VII)。
  - `isEmptyDraft(draft: Draft): boolean`。
  - `saveNewDraft(user, draft)`: 空なら `newKey(user, draft.date)` を消し、空でなければ保持する。画像は既存の `saveDraft` と同じく `{ type, data: ArrayBuffer }` で保持する(変換は既存の処理を共通化して使う)。
  - `loadNewDraft(user, date)`、`clearNewDraft(user, date)`。
  - `listNewDraftDates(user)`: `IDBKeyRange.bound(`${user}:new:`, `${user}:new:￿`)` で `getAll` と `getAllKeys` を読み、空でないものの日付を降順で返す。
  - `migrateLegacyNewDraft(user)`: 1つの readwrite トランザクションで、`${user}:new` を読み、空なら消す。空でなく `diaryDateSchema`(`@diary/shared`)で正しい日付なら、`newKey` が無い場合に限り書き込み、古いキーを消す。日付が正しくなければ `Error('書きかけの日付を読み取れませんでした')` を投げる(憲章 VIII)。
  - 既存の `saveDraft`、`loadDraft`、`clearDraft` は編集の書きかけ(slot は日付)専用として残し、先頭のコメント「slot は新規作成なら 'new'」を「slot は編集する絵日記の日付」に直す。`clearAllDrafts` は変えない。
- [X] T007 [P] `initialDiaryDate` を `apps/web/src/lib/dates.ts` に実装し、T005 を通す。形式の判定は `diaryDateSchema.safeParse` を使う。`param` が正しく、`param <= today` ならその値、それ以外は `today` を返す。不正な値は通知せず今日にする(research.md §4 に理由)

**Checkpoint**: 書きかけを日付ごとに扱えて、開く日付を決められる。

---

## Phase 3: User Story 1 - 「書く」を押すと今日の絵日記が開く (Priority: P1) 🎯 MVP

**Goal**: 以前に別の日の記入画面を開いていても、「書く」で今日の日付と今日の書きかけだけが出る。

**Independent Test**: 11月8日に「書く」を開いて何も入力せずに離れ、11月22日に再び「書く」を開くと、日付欄が「11月 22日(日)」になる。

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T008 [P] [US1] `apps/web/tests/diary-editor.test.tsx` の `describe('DiaryEditor')` に、日付を 2026-11-22 に固定した次のテストを加え、失敗を確かめる(不具合の再現)。
  - (a) 修正前の形 `saveDraft('alice', 'new', { date: '2026-11-08', body: '', weather: '', image: null })` がある状態で `/diaries/new` を開くと、日付の入力欄の値が `2026-11-22` で、日付欄の表示が `formatDiaryDay('2026-11-22')`(「11月 22日(日)」)。
  - (b) `saveNewDraft('alice', { date: '2026-11-08', body: '11がつ8かのぶん', weather: 'sunny', image: null })` がある状態で `/diaries/new` を開くと、日付は `2026-11-22` で、文章欄は空、`晴れ` は未選択。
  - (c) `saveNewDraft` で 2026-11-22 の書きかけ(文章、天気 `snowy`)がある状態で `/diaries/new` を開くと、その文章と `雪` が戻る(US1-3)。
  - (d) 何も入力せずに 800ms 待ったあと、`listNewDraftDates('alice')` が空で、`loadDraft('alice', 'new')` も `null`(FR-004)。
  - (e) 文章を入力して書きかけが保持されたあと、文章を空にすると、`loadNewDraft('alice', '2026-11-22')` が `null` に戻る。
- [X] T009 [US1] 既存のテストを書き換え、失敗を確かめる。理由(別の日付の書きかけが「書く」で戻る動きは 003 の FR-001、FR-003 に反する)を各テストの直前のコメントに1行で書く。
  - `restores a draft saved before the tab was closed`: 書きかけを `saveNewDraft('alice', { date: todayLocal(), … })` で作るよう変える。期待(文章と `雪` が戻る)は変えない。
  - `saves and clears the draft`: 保存後に `loadNewDraft('alice', todayLocal())` が `null` であることを確かめる。
  - `writes the draft shortly after typing`: `loadNewDraft('alice', todayLocal())?.body` が `したがき` になることを確かめる。
- [X] T010 [P] [US1] `e2e/diary.spec.ts` に次のテストを加え、失敗を確かめる。
  - `page.clock.setFixedTime(new Date(2026, 10, 8, 9, 0))` で `/diaries/new` を開き、日付欄に `11月 8日(日)` が出るのを待ってからページを閉じる。新しいページで `setFixedTime(new Date(2026, 10, 22, 9, 0))` にして `/diaries/new` を開くと、日付欄に `11月 22日(日)` が出る。
  - 同じ流れで、11月8日に文章 `8かのぶん` を入力して 800ms 待ってから閉じると、11月22日の「書く」の文章欄は空である。
  - 既存の `restores the draft after the tab is closed` は、同じ日に開き直すので変えずに通ることを確かめる。

### Implementation for User Story 1

- [X] T011 [US1] `apps/web/src/features/diary/DiaryEditor.tsx` を次のように直し、T008(a)〜(e) と T009 を通す。
  - 日付の初期値: 新規は `initialDiaryDate(search.get('date'), today)`、編集は `params.date`(変えない)。
  - 読み込み: 新規では、まず `migrateLegacyNewDraft(me.handle)` を待ち、続けて `loadNewDraft(me.handle, date)` の結果で文章、天気、絵を戻す。`setDate(draft.date)` で日付を置き換える処理を消す。編集の読み込み(`loadDraft(me.handle, slot)`、`setDate(slot)`)は変えない。
  - 保持: 新規では `saveNewDraft(me.handle, { date, body, weather, image })`、編集では従来の `saveDraft(me.handle, slot, …)` を使う。
  - 保存の成功時: 新規では `clearNewDraft(me.handle, date)`、編集では従来の `clearDraft(me.handle, slot)`。
  - 移行と読み込みの失敗は、従来どおり `setError` で画面に示す(憲章 VIII)。
- [X] T012 [US1] `apps/web/src/features/diary/DiaryEditor.tsx` に `NewDiaryEditor` を追加する。`useLocation()` の `location.key` を `key` にして `<DiaryEditor />` を描く。`apps/web/src/routes.tsx` の `/diaries/new` の要素を `<NewDiaryEditor />` に変える(research.md §5)。テストを `apps/web/tests/diary-editor.test.tsx` に先に加えて失敗を確かめる: `/diaries/new?date=2026-11-15` を開いたあと、画面内の `<Link to="/diaries/new">` 相当の移動(テスト用に `Routes` の外に置いたリンク「書く」を押す)で、日付が `2026-11-22` に変わる。`renderEditor` の `/diaries/new` も `NewDiaryEditor` に変える
- [X] T013 [US1] T008、T009、T010、T012 のテストと、`apps/web/tests/` のすべての単体テスト、`e2e/diary.spec.ts` と `e2e/diary-page.spec.ts` が通ることを確かめる

**Checkpoint**: 「書く」が常に今日の日付で開き、ほかの日付の書きかけが入らない(MVP)。

---

## Phase 4: User Story 2 - カレンダーから選んだ日付で開く (Priority: P2)

**Goal**: カレンダーで選んだ日付で記入画面が開き、その日付の書きかけだけが戻る。記入画面で日付を変えると、書きかけも変更後の日付へ移る。

**Independent Test**: 今日の書きかけを残してカレンダーで過去の日付を選ぶと、その日付で空の記入画面が開く。

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] `apps/web/tests/diary-editor.test.tsx` に、日付を 2026-11-22 に固定した次のテストを加え、失敗を確かめる。
  - (a) 今日の書きかけがある状態で `/diaries/new?date=2026-11-15` を開くと、日付は `2026-11-15` で文章欄は空(US2-1)。
  - (b) 2026-11-15 の書きかけがある状態で `/diaries/new?date=2026-11-15` を開くと、その内容が戻る(US2-2)。
  - (c) `/diaries/new?date=2026-11-23`、`?date=abc` は `2026-11-22` で開く(FR-002)。
  - (d) 今日の画面で文章を入力して保持されたあと、日付の入力欄を `2026-11-15` に変えると、`loadNewDraft('alice', '2026-11-15')` に文章が入り、`loadNewDraft('alice', '2026-11-22')` は `null`(FR-005)。
  - (e) 2026-11-15 に空でない書きかけがある状態で、今日の画面で文章を入力して日付を 2026-11-15 に変えると、`window.confirm` が「2026年11月15日(日)の書きかけを、いま書いている内容で置き換えますか?」で呼ばれる。`vi.spyOn(window, 'confirm').mockReturnValue(false)` では、日付の入力欄が `2026-11-22` に戻り、両方の書きかけが変わらない。`true` では、2026-11-15 の書きかけが今の内容になり、2026-11-22 の書きかけは消える。
- [X] T015 [P] [US2] `apps/web/tests/calendar.test.tsx` に、絵日記がない過去の日付のリンクの `href` が `/diaries/new?date=<その日付>` であることのテストが無ければ加える(既存の動きの確認。失敗しなくてよい)

### Implementation for User Story 2

- [X] T016 [US2] `apps/web/src/features/diary/DiaryEditor.tsx` の日付の入力欄の `onChange` を直し、T014(d)(e) を通す(contracts/diary-editor-ui.md「日付の変更」、research.md §6)。新規のみ。
  - 変更後の日付 `next` について `loadNewDraft(me.handle, next)` を読み、空でない書きかけがあれば `window.confirm(`${formatJapaneseDate(next)}の書きかけを、いま書いている内容で置き換えますか?`)` で確かめる。取り消されたら日付を変えない。
  - 変える場合は `clearNewDraft(me.handle, 前の日付)` を待ってから `setDate(next)` する。以後の保持(500ms 後)は `next` のキーに入る。
  - 書きかけの読み書きの失敗は `setError` で示す。
- [X] T017 [US2] T014、T015 と `apps/web/tests/` のすべての単体テストが通ることを確かめる

**Checkpoint**: カレンダーからの記入と日付の変更で、書きかけが日付どおりに分かれる。

---

## Phase 5: User Story 3 - ほかの日付の書きかけに気づける (Priority: P3)

**Goal**: 画面の日付以外の書きかけを、記入画面で案内し、そこから開ける。

**Independent Test**: 11月8日の書きかけを残して11月22日に「書く」を開くと案内が出て、リンクから11月8日の記入画面が開き、その書きかけが戻る。

### Tests for User Story 3 ⚠️

- [X] T018 [P] [US3] `apps/web/tests/diary-editor.test.tsx` に、日付を 2026-11-22 に固定した次のテストを加え、失敗を確かめる(contracts/diary-editor-ui.md「書きかけの案内」)。
  - (a) 2026-11-08 と 2026-11-15 に空でない書きかけがある状態で `/diaries/new` を開くと、`getByRole('navigation', { name: '書きかけの絵日記' })` の中に「書きかけの絵日記があります」と、リンク「2026年11月15日(日)」「2026年11月8日(日)」がこの順で並び、`href` が `/diaries/new?date=2026-11-15`、`/diaries/new?date=2026-11-08`。
  - (b) 画面の日付(今日)の書きかけは案内に出ない。
  - (c) 書きかけが無い、または空の書きかけしか無いときは、案内(navigation)が無い(US3-2)。
  - (d) 編集画面 `/diaries/2026-11-01/edit` では案内を出さない。
  - (e) 案内のリンクを押すと、日付が 2026-11-08 になり、その書きかけの文章が戻り、案内には 2026-11-22 ではなく 2026-11-15 だけが残る(今日の書きかけが無いため)。
- [X] T019 [P] [US3] `e2e/diary.spec.ts` に次のテストを加え、失敗を確かめる。`page.clock.setFixedTime` で 2026-11-08 に「書く」で文章を入力して 800ms 待ち、閉じる。2026-11-22 に「書く」を開くと「書きかけの絵日記があります」とリンク「2026年11月8日(日)」が出る。リンクを押すと日付欄が `11月 8日(日)` で、文章が戻る。幅360pxで横スクロールが出ないことも確かめる(`document.documentElement.scrollWidth <= 360`)

### Implementation for User Story 3

- [X] T020 [US3] `apps/web/src/features/diary/DiaryEditor.tsx` に案内を加え、T018 と T019 を通す。
  - 新規の画面で、読み込みの後と、書きかけを保持または消去した後に `listNewDraftDates(me.handle)` を読み、画面の日付を除いた日付を状態に入れる。
  - 1件以上あれば、見出し `h1` の直後、`DiaryPage` の前に `<nav aria-label="書きかけの絵日記" className="draft-notice">` を置き、「書きかけの絵日記があります」と、各日付の `<Link to={`/diaries/new?date=${d}`}>{formatJapaneseDate(d)}</Link>` を `ul` で並べる。
  - 一覧の読み込みの失敗は `setError` で示す。
- [X] T021 [P] [US3] `apps/web/src/styles.css` に `.draft-notice` の見た目を追加する。カードの外に置き、既存のリンクの色と余白に合わせる。日付のリンクは折り返して並べ、360px で横にはみ出さない(見た目のみ。テストは T019)
- [X] T022 [US3] T018、T019 と `apps/web/tests/` のすべての単体テスト、`e2e/accessibility.spec.ts` が通ることを確かめる

**Checkpoint**: すべてのユーザーストーリーが独立して動く。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 品質ゲートと手での確認

- [ ] T023 [P] `quickstart.md` の「手で確かめる手順」1〜6 と「修正前の書きかけの移行を確かめる」を、開発サーバー(`npm run dev`)で行い、結果を確かめる。期待と違う点があれば、該当するストーリーのタスクに戻って直す
- [ ] T024 品質ゲートを実行し、すべて成功することを確かめる: `npm test`、`npx playwright test`、`npm run lint`、`npm run typecheck`、`npm audit`(憲章「品質ゲート」)
- [X] T025 [P] 使わなくなった処理が残っていないか確かめる: `DiaryEditor.tsx` で `slot === 'new'` を書きかけのキーに使う箇所、`draft-store.ts` のコメント、`apps/web/tests/` での `saveDraft('alice', 'new', …)` の使い方(移行のテスト以外)が残っていないこと

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: すぐに始められる。T002、T003 は T001 の後に並行して行える
- **Foundational (Phase 2)**: Setup の後。すべてのストーリーの前提
- **US1 (Phase 3)**: Foundational の後。MVP
- **US2 (Phase 4)**: Foundational の後。T016 は T011(新規の保持を `saveNewDraft` に替える)を前提とするため、US1 の後に行う
- **US3 (Phase 5)**: Foundational の後。T020 は T011 の読み込みと保持の流れに一覧の更新を加えるため、US1 の後に行う。US2 とは独立
- **Polish (Phase 6)**: すべてのストーリーの後

### Within Each User Story

- テストを先に書き、失敗を確かめてから実装する(憲章 V)
- `DiaryEditor.tsx` を変えるタスク(T011、T012、T016、T020)は同じファイルなので順に行う
- 同じテストファイル `apps/web/tests/diary-editor.test.tsx` に書くタスク(T008、T009、T012、T014、T018)は同時に編集しない

### Parallel Opportunities

- T002、T003(別ファイルのドキュメント)
- T004、T005(別のテストファイル)。T006 と T007 も別ファイルで並行できる
- US1: T008 と T010(単体と E2E)
- US2: T014 と T015
- US3: T018 と T019、実装では T021(CSS)を T020 と並行
- US2 と US3 は、US1 の完了後に並行して進められる(ただし `DiaryEditor.tsx` の編集は順に行う)

---

## Parallel Example: User Story 1

```bash
# US1 のテストを同時に書く:
Task: "T008 diary-editor.test.tsx に不具合の再現テスト (a)〜(e) を加える"
Task: "T010 e2e/diary.spec.ts に page.clock で日付をまたぐテストを加える"
```

## Parallel Example: Foundational

```bash
Task: "T004 draft-store.test.ts を日付ごとの書きかけと移行のテストに書き換える"
Task: "T005 dates.test.ts に initialDiaryDate のテストを加える"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1(ブランチ、ADR、001 の注記)
2. Phase 2(書きかけの日付ごとの保持、移行、`initialDiaryDate`)
3. Phase 3(US1)を終え、「書く」が今日の日付で開くことを確かめる → ここで報告された不具合は直る
4. **STOP and VALIDATE**: T013 のテストと quickstart の手順1、3

### Incremental Delivery

1. Setup + Foundational → 土台
2. US1 → 不具合の修正(MVP)
3. US2 → カレンダーからの記入と日付の変更で書きかけが正しく分かれる
4. US3 → ほかの日付の書きかけを見失わない(US1 の後は、案内がないと今日以外の書きかけに気づけないため、US1 と同じリリースに含めるのが望ましい)
5. Polish → 品質ゲート

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- 既存のテストを変える場合は、理由をコメントに残す(憲章 V)
- サーバー、DB、エクスポートの形式は変えない
- Commit after each task or logical group

## 実装時の記録(2026-11-22)

- E2E は、開発サーバーを `APP_ORIGIN=https://localhost:5173 RP_ID=localhost` で起動して実行した(`.env` は LAN 用のホストのため、E2E の Origin の確認とパスキーの RP ID に合わない)。
  - Chromium、WebKit、mobile-360: すべて成功(Firefox を除く 124 件成功、10 件はブラウザの条件によるスキップ)。
  - Firefox: この端末で Firefox が起動できず(`browserType.launch: Failed to launch the browser process`)、実行できなかった。コードの問題ではない。`npx playwright install firefox` で入れ直してから確かめる必要がある。
- T024: `npm test`、`npm run lint`、`npm run typecheck`、`npm audit` は成功。`npx playwright test` は Firefox 以外で成功。
- T023: 手での確認は未実施。
