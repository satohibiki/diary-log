import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiaryEditor, NewDiaryEditor } from '../src/features/diary/DiaryEditor.tsx';
import { DiaryView } from '../src/features/diary/DiaryView.tsx';
import { formatDiaryDay, todayLocal } from '../src/lib/dates.ts';
import { clearAllDrafts, listNewDraftDates, loadDraft, loadNewDraft, saveDraft, saveNewDraft } from '../src/lib/draft-store.ts';
import { me, mockFetch } from './helpers.ts';

vi.mock('../src/components/RequireAuth.tsx', () => ({ useMe: () => me }));

beforeEach(async () => {
  await clearAllDrafts();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => undefined }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const diary = {
  date: '2026-11-01',
  body: '<script>alert(1)</script> と かいた',
  weather: 'rainy',
  imageUrl: '/api/v1/users/alice/diaries/2026-11-01/image?v=1',
  author: { handle: 'alice', nickname: 'ありす', hasAvatar: false },
};

function renderEditor(path = '/diaries/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Link to="/diaries/new">書く</Link>
      <Routes>
        <Route path="/diaries/new" element={<NewDiaryEditor />} />
        <Route path="/diaries/:date/edit" element={<DiaryEditor />} />
        <Route path="/users/:handle/diaries/:date" element={<p>閲覧画面</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAll() {
  const file = new File(['img'], 'a.png', { type: 'image/png' });
  await userEvent.upload(screen.getByLabelText('絵(画像)'), file);
  await userEvent.click(screen.getByLabelText('晴れ'));
  await userEvent.type(screen.getByLabelText('文章'), 'きょうは はれ');
}

describe('DiaryEditor', () => {
  it('defaults the date to today and does not allow future dates', () => {
    renderEditor();
    const input = screen.getByLabelText('日付');
    expect((input as HTMLInputElement).value).toBe(todayLocal());
    expect(input.getAttribute('max')).toBe(todayLocal());
  });

  // 002 FR-006 で縦書き(001 FR-010)を横書きの罫線に置き換えたため、縦書きの確認はページ構成の確認に置き換えた
  it('lays out the editor as a diary page: picture, date and weather, then ruled text', () => {
    const { container } = renderEditor();
    const sheet = container.querySelector('.diary-page__sheet');
    expect(sheet).not.toBeNull();
    expect(container.querySelector('.diary-page__picture')?.contains(screen.getByLabelText('絵(画像)'))).toBe(true);
    const day = container.querySelector('.diary-page__day');
    expect(day?.contains(screen.getByLabelText('日付'))).toBe(true);
    expect(day?.textContent).toContain(formatDiaryDay(todayLocal()));
    const weather = container.querySelector('.diary-page__weather');
    const group = screen.getByRole('group', { name: '天気' });
    expect(weather?.contains(group)).toBe(true);
    expect(['晴れ', 'くもり', '雨', '雪'].map((w) => group.contains(screen.getByLabelText(w)))).toEqual([true, true, true, true]);
    const body = screen.getByLabelText('文章');
    expect(container.querySelector('.diary-page__body')?.contains(body)).toBe(true);
    expect(body.classList.contains('ruled-text')).toBe(true);
  });

  it('shows the year outside the page and only month, day, and weekday inside', () => {
    const { container } = renderEditor();
    const year = `${todayLocal().slice(0, 4)}年`;
    expect(container.querySelector('.diary-page__sheet')?.textContent).not.toContain(year);
    expect(container.querySelector('.diary-page')?.textContent).toContain(year);
  });

  // 003 FR-005: 日付の変更は変更後の日付の書きかけを確かめてから反映するため、反映を待つ(期待は変えない)
  it('updates the date field text when the date changes', async () => {
    const { container } = renderEditor();
    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-11-03' } });
    await vi.waitFor(() => {
      expect(container.querySelector('.diary-page__day')?.textContent).toContain('11月 3日(火)');
    });
  });

  it('lets only one weather be chosen', async () => {
    renderEditor();
    await userEvent.click(screen.getByLabelText('晴れ'));
    await userEvent.click(screen.getByLabelText('雨'));
    expect(screen.getByLabelText<HTMLInputElement>('雨').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('晴れ').checked).toBe(false);
  });

  it('rejects a future date when saving', async () => {
    const calls = mockFetch({});
    renderEditor();
    await fillAll();
    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2999-01-01' } });
    // 003 FR-005: 日付の変更の反映を待つ
    await vi.waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('日付').value).toBe('2999-01-01');
    });
    await userEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect((await screen.findByRole('alert')).textContent).toContain('未来の日付は選べません');
    expect(calls).toHaveLength(0);
  });

  it('shows the remaining characters', async () => {
    renderEditor();
    expect(screen.getByText('残り 400 文字')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('文章'), 'あい');
    expect(screen.getByText('残り 398 文字')).toBeTruthy();
  });

  it('lists missing items instead of saving', async () => {
    const calls = mockFetch({});
    renderEditor();
    // 下書きの読み込みが終わるまで保存ボタンは押せない
    await vi.waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存する' }).disabled).toBe(false);
    });
    await userEvent.click(screen.getByRole('button', { name: '保存する' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('絵');
    expect(alert.textContent).toContain('文章');
    expect(alert.textContent).toContain('天気');
    expect(calls).toHaveLength(0);
  });

  it('keeps the input and shows the error when saving fails', async () => {
    mockFetch({ 'POST /api/v1/me/diaries': { status: 500, body: { type: 'server-error', title: 'サーバーでエラーが発生しました', status: 500 } } });
    renderEditor();
    await fillAll();
    await userEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect((await screen.findByRole('alert')).textContent).toContain('サーバーでエラー');
    expect(screen.getByLabelText<HTMLTextAreaElement>('文章').value).toBe('きょうは はれ');
  });

  it('tells the user that a connection is required when offline', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    renderEditor();
    await fillAll();
    await userEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect((await screen.findByRole('alert')).textContent).toContain('接続');
    expect(screen.getByLabelText<HTMLTextAreaElement>('文章').value).toBe('きょうは はれ');
  });

  it('guides to editing when a diary already exists for the date', async () => {
    mockFetch({ 'POST /api/v1/me/diaries': { status: 409, body: { type: 'diary-exists', title: 'その日付の絵日記は既にあります', status: 409 } } });
    renderEditor();
    await fillAll();
    await userEvent.click(screen.getByRole('button', { name: '保存する' }));
    const link = await screen.findByRole('link', { name: 'その日の絵日記を編集する' });
    expect(link.getAttribute('href')).toBe(`/diaries/${todayLocal()}/edit`);
  });

  // 新規の書きかけを日付ごとに保持するようにしたため(003 FR-003)、今日の日付の書きかけが消えることを確かめる
  it('saves and clears the draft', async () => {
    mockFetch({ 'POST /api/v1/me/diaries': { status: 201, body: { ...diary, date: todayLocal() } } });
    renderEditor();
    await fillAll();
    await vi.waitFor(async () => {
      expect(await loadNewDraft('alice', todayLocal())).not.toBeNull();
    });
    await userEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(await screen.findByText('閲覧画面')).toBeTruthy();
    expect(await loadNewDraft('alice', todayLocal())).toBeNull();
  });

  // 別の日付の書きかけが「書く」で戻る動きは 003 FR-001、FR-003 に反するため、今日の日付の書きかけで確かめる
  it('restores a draft saved before the tab was closed', async () => {
    await saveNewDraft('alice', { date: todayLocal(), body: 'のこっていた', weather: 'snowy', image: null });
    renderEditor();
    expect(await screen.findByDisplayValue('のこっていた')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('雪').checked).toBe(true);
  });

  it('writes the draft shortly after typing', async () => {
    renderEditor();
    await vi.waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存する' }).disabled).toBe(false);
    });
    fireEvent.change(screen.getByLabelText('文章'), { target: { value: 'したがき' } });
    await vi.waitFor(
      async () => {
        // 新規の書きかけは日付ごとのキーに保持する(003 FR-003)
        expect((await loadNewDraft('alice', todayLocal()))?.body).toBe('したがき');
      },
      { timeout: 2000, interval: 100 },
    );
  });
});

// 003: 「書く」で開く絵日記の日付を今日にする
describe('DiaryEditor on 2026-11-22', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 22, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const dateInput = () => screen.getByLabelText<HTMLInputElement>('日付');
  const ready = () =>
    vi.waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存する' }).disabled).toBe(false);
    });

  it('opens today even if an empty legacy draft has another date', async () => {
    await saveDraft('alice', 'new', { date: '2026-11-08', body: '', weather: '', image: null });
    const { container } = renderEditor();
    await ready();
    expect(dateInput().value).toBe('2026-11-22');
    expect(container.querySelector('.diary-page__day')?.textContent).toContain(formatDiaryDay('2026-11-22'));
    expect(formatDiaryDay('2026-11-22')).toBe('11月 22日(日)');
  });

  it('does not put a draft of another date into today', async () => {
    await saveNewDraft('alice', { date: '2026-11-08', body: '11がつ8かのぶん', weather: 'sunny', image: null });
    renderEditor();
    await ready();
    expect(dateInput().value).toBe('2026-11-22');
    expect(screen.getByLabelText<HTMLTextAreaElement>('文章').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('晴れ').checked).toBe(false);
  });

  it('restores the draft of today', async () => {
    await saveNewDraft('alice', { date: '2026-11-22', body: 'きょうのぶん', weather: 'snowy', image: null });
    renderEditor();
    expect(await screen.findByDisplayValue('きょうのぶん')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('雪').checked).toBe(true);
    expect(dateInput().value).toBe('2026-11-22');
  });

  it('does not keep a draft when nothing is entered', async () => {
    renderEditor();
    await ready();
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(await listNewDraftDates('alice')).toEqual([]);
    expect(await loadDraft('alice', 'new')).toBeNull();
  });

  it('removes the draft when all input is cleared', async () => {
    renderEditor();
    await ready();
    fireEvent.change(screen.getByLabelText('文章'), { target: { value: 'けす' } });
    await vi.waitFor(async () => {
      expect((await loadNewDraft('alice', '2026-11-22'))?.body).toBe('けす');
    }, { timeout: 2000, interval: 100 });
    fireEvent.change(screen.getByLabelText('文章'), { target: { value: '' } });
    await vi.waitFor(async () => {
      expect(await loadNewDraft('alice', '2026-11-22')).toBeNull();
    }, { timeout: 2000, interval: 100 });
  });

  it('opens today again when 書く is pressed on an editor opened for another date', async () => {
    renderEditor('/diaries/new?date=2026-11-15');
    await ready();
    expect(dateInput().value).toBe('2026-11-15');
    await userEvent.click(screen.getByRole('link', { name: '書く' }));
    await ready();
    expect(dateInput().value).toBe('2026-11-22');
  });

  it('opens the chosen date without the draft of today', async () => {
    await saveNewDraft('alice', { date: '2026-11-22', body: 'きょう', weather: '', image: null });
    renderEditor('/diaries/new?date=2026-11-15');
    await ready();
    expect(dateInput().value).toBe('2026-11-15');
    expect(screen.getByLabelText<HTMLTextAreaElement>('文章').value).toBe('');
  });

  it('restores the draft of the chosen date', async () => {
    await saveNewDraft('alice', { date: '2026-11-15', body: '15にち', weather: '', image: null });
    renderEditor('/diaries/new?date=2026-11-15');
    expect(await screen.findByDisplayValue('15にち')).toBeTruthy();
    expect(dateInput().value).toBe('2026-11-15');
  });

  it('opens today for a future or invalid date in the URL', async () => {
    for (const value of ['2026-11-23', 'abc']) {
      const { unmount } = renderEditor(`/diaries/new?date=${value}`);
      await ready();
      expect(dateInput().value).toBe('2026-11-22');
      unmount();
    }
  });

  it('moves the draft to the new date when the date changes', async () => {
    renderEditor();
    await ready();
    fireEvent.change(screen.getByLabelText('文章'), { target: { value: 'うつす' } });
    await vi.waitFor(async () => {
      expect((await loadNewDraft('alice', '2026-11-22'))?.body).toBe('うつす');
    }, { timeout: 2000, interval: 100 });
    fireEvent.change(dateInput(), { target: { value: '2026-11-15' } });
    await vi.waitFor(async () => {
      expect((await loadNewDraft('alice', '2026-11-15'))?.body).toBe('うつす');
      expect(await loadNewDraft('alice', '2026-11-22')).toBeNull();
    }, { timeout: 2000, interval: 100 });
  });

  it('asks before replacing a draft of the new date, and keeps both when cancelled', async () => {
    await saveNewDraft('alice', { date: '2026-11-15', body: 'まえから', weather: '', image: null });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderEditor();
    await ready();
    fireEvent.change(screen.getByLabelText('文章'), { target: { value: 'いまの' } });
    await vi.waitFor(async () => {
      expect((await loadNewDraft('alice', '2026-11-22'))?.body).toBe('いまの');
    }, { timeout: 2000, interval: 100 });
    fireEvent.change(dateInput(), { target: { value: '2026-11-15' } });
    await vi.waitFor(() => {
      expect(confirm).toHaveBeenCalledWith('2026年11月15日(日)の書きかけを、いま書いている内容で置き換えますか?');
    });
    expect(dateInput().value).toBe('2026-11-22');
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect((await loadNewDraft('alice', '2026-11-15'))?.body).toBe('まえから');
    expect((await loadNewDraft('alice', '2026-11-22'))?.body).toBe('いまの');
  });

  it('lists drafts of other dates, newest first', async () => {
    await saveNewDraft('alice', { date: '2026-11-08', body: '8か', weather: '', image: null });
    await saveNewDraft('alice', { date: '2026-11-15', body: '15にち', weather: '', image: null });
    await saveNewDraft('alice', { date: '2026-11-22', body: 'きょう', weather: '', image: null });
    renderEditor();
    const notice = await screen.findByRole('navigation', { name: '書きかけの絵日記' });
    expect(notice.textContent).toContain('書きかけの絵日記があります');
    const links = within(notice).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['2026年11月15日(日)', '2026年11月8日(日)']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/diaries/new?date=2026-11-15', '/diaries/new?date=2026-11-08']);
  });

  it('shows no notice without non-empty drafts of other dates', async () => {
    await saveDraft('alice', 'new', { date: '2026-11-08', body: '', weather: '', image: null });
    await saveNewDraft('alice', { date: '2026-11-22', body: 'きょう', weather: '', image: null });
    renderEditor();
    await screen.findByDisplayValue('きょう');
    expect(screen.queryByRole('navigation', { name: '書きかけの絵日記' })).toBeNull();
  });

  it('shows no notice on the edit screen', async () => {
    mockFetch({ '/api/v1/users/alice/diaries/2026-11-01': { status: 200, body: diary } });
    await saveNewDraft('alice', { date: '2026-11-08', body: '8か', weather: '', image: null });
    renderEditor('/diaries/2026-11-01/edit');
    await ready();
    expect(screen.queryByRole('navigation', { name: '書きかけの絵日記' })).toBeNull();
  });

  it('opens the draft of another date from the notice', async () => {
    await saveNewDraft('alice', { date: '2026-11-08', body: '8かのぶん', weather: '', image: null });
    await saveNewDraft('alice', { date: '2026-11-15', body: '15にち', weather: '', image: null });
    renderEditor();
    const notice = await screen.findByRole('navigation', { name: '書きかけの絵日記' });
    await userEvent.click(within(notice).getByRole('link', { name: '2026年11月8日(日)' }));
    expect(await screen.findByDisplayValue('8かのぶん')).toBeTruthy();
    expect(dateInput().value).toBe('2026-11-08');
    const after = await screen.findByRole('navigation', { name: '書きかけの絵日記' });
    await vi.waitFor(() => {
      expect(within(after).getAllByRole('link').map((a) => a.textContent)).toEqual(['2026年11月15日(日)']);
    });
  });

  it('replaces the draft of the new date when confirmed', async () => {
    await saveNewDraft('alice', { date: '2026-11-15', body: 'まえから', weather: '', image: null });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderEditor();
    await ready();
    fireEvent.change(screen.getByLabelText('文章'), { target: { value: 'いまの' } });
    fireEvent.change(dateInput(), { target: { value: '2026-11-15' } });
    await vi.waitFor(async () => {
      expect(dateInput().value).toBe('2026-11-15');
      expect((await loadNewDraft('alice', '2026-11-15'))?.body).toBe('いまの');
      expect(await loadNewDraft('alice', '2026-11-22')).toBeNull();
    }, { timeout: 2000, interval: 100 });
  });
});

describe('DiaryView', () => {
  function renderView() {
    return render(
      <MemoryRouter initialEntries={['/users/alice/diaries/2026-11-01']}>
        <Routes>
          <Route path="/users/:handle/diaries/:date" element={<DiaryView />} />
          <Route path="/calendar" element={<p>カレンダー画面</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows markup in the body as plain text', async () => {
    mockFetch({ '/api/v1/users/alice/diaries/2026-11-01': { status: 200, body: diary } });
    const { container } = renderView();
    expect(await screen.findByText(/<script>alert\(1\)<\/script>/)).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/雨/)).toBeTruthy();
  });

  it('lets the owner delete after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const calls = mockFetch({
      '/api/v1/users/alice/diaries/2026-11-01': { status: 200, body: diary },
      'DELETE /api/v1/me/diaries/2026-11-01': { status: 204 },
    });
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: '削除する' }));
    expect(confirm).toHaveBeenCalled();
    expect(await screen.findByText('カレンダー画面')).toBeTruthy();
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true);
  });

  it('shows the not-found message for diaries it cannot see', async () => {
    mockFetch({ '/api/v1/users/alice/diaries/2026-11-01': { status: 404, body: { type: 'not-found', title: '見つかりません', status: 404 } } });
    renderView();
    expect((await screen.findByRole('alert')).textContent).toContain('見つかりません');
  });
});
