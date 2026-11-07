import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiaryEditor } from '../src/features/diary/DiaryEditor.tsx';
import { DiaryView } from '../src/features/diary/DiaryView.tsx';
import { todayLocal } from '../src/lib/dates.ts';
import { clearAllDrafts, loadDraft, saveDraft } from '../src/lib/draft-store.ts';
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
      <Routes>
        <Route path="/diaries/new" element={<DiaryEditor />} />
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

  it('writes the text vertically', () => {
    renderEditor();
    expect(screen.getByLabelText('文章').classList.contains('vertical-text')).toBe(true);
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

  it('saves and clears the draft', async () => {
    mockFetch({ 'POST /api/v1/me/diaries': { status: 201, body: { ...diary, date: todayLocal() } } });
    renderEditor();
    await fillAll();
    await userEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(await screen.findByText('閲覧画面')).toBeTruthy();
    expect(await loadDraft('alice', 'new')).toBeNull();
  });

  it('restores a draft saved before the tab was closed', async () => {
    await saveDraft('alice', 'new', { date: '2026-11-03', body: 'のこっていた', weather: 'snowy', image: null });
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
        expect((await loadDraft('alice', 'new'))?.body).toBe('したがき');
      },
      { timeout: 2000, interval: 100 },
    );
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
