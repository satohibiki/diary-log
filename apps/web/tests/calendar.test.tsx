import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from '../src/features/calendar/CalendarPage.tsx';
import { me, mockFetch } from './helpers.ts';

vi.mock('../src/components/RequireAuth.tsx', () => ({ useMe: () => me }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 7, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/calendar" element={<CalendarPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CalendarPage', () => {
  it('marks dates that have a diary and links to them', async () => {
    mockFetch({ '/api/v1/me/diaries?month=2026-11': { status: 200, body: { dates: ['2026-11-03'] } } });
    renderAt('/calendar');
    const link = await screen.findByRole('link', { name: '11月3日 絵日記あり' });
    expect(link.getAttribute('href')).toBe('/users/alice/diaries/2026-11-03');
  });

  it('lets the user create a diary from a past date without one', async () => {
    mockFetch({ '/api/v1/me/diaries?month=2026-11': { status: 200, body: { dates: [] } } });
    renderAt('/calendar');
    const link = await screen.findByRole('link', { name: '11月5日 絵日記を書く' });
    expect(link.getAttribute('href')).toBe('/diaries/new?date=2026-11-05');
  });

  it('does not allow future dates', async () => {
    mockFetch({ '/api/v1/me/diaries?month=2026-11': { status: 200, body: { dates: [] } } });
    renderAt('/calendar');
    await screen.findByRole('link', { name: '11月7日 絵日記を書く' });
    expect(screen.queryByRole('link', { name: /11月8日/ })).toBeNull();
    expect(screen.getByRole('button', { name: '次の月' }).hasAttribute('disabled')).toBe(true);
  });

  it('moves to the previous month with the keyboard', async () => {
    const calls = mockFetch({
      '/api/v1/me/diaries?month=2026-11': { status: 200, body: { dates: [] } },
      '/api/v1/me/diaries?month=2026-10': { status: 200, body: { dates: ['2026-10-31'] } },
    });
    renderAt('/calendar');
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const prev = await screen.findByRole('button', { name: '前の月' });
    prev.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: '2026年10月' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: '10月31日 絵日記あり' })).toBeTruthy();
    expect(calls.map((c) => c.url)).toContain('/api/v1/me/diaries?month=2026-10');
  });

  it('shows an error instead of an empty calendar when loading fails', async () => {
    mockFetch({ '/api/v1/me/diaries?month=2026-11': { status: 500, body: { type: 'server-error', title: 'サーバーでエラーが発生しました', status: 500 } } });
    renderAt('/calendar');
    expect((await screen.findByRole('alert')).textContent).toContain('サーバーでエラー');
  });
});
