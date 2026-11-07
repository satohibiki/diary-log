import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionsPage } from '../src/features/social/ConnectionsPage.tsx';
import { FeedPage } from '../src/features/social/FeedPage.tsx';
import { UserPage } from '../src/features/social/UserPage.tsx';
import { me, mockFetch } from './helpers.ts';

vi.mock('../src/components/RequireAuth.tsx', () => ({ useMe: () => me }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const author = { handle: 'carol', nickname: 'きゃろる', hasAvatar: false };
const diary = (date: string, body: string) => ({ date, body, weather: 'sunny', imageUrl: `/img/${date}`, author });

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/users/:handle" element={<UserPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const emptyLists = {
  '/api/v1/me/following': { status: 200, body: { approved: [], pending: [] } },
  '/api/v1/me/followers': { status: 200, body: { approved: [], pending: [] } },
  '/api/v1/me/blocks': { status: 200, body: [] },
};

describe('FeedPage', () => {
  it('shows followed users’ diaries and loads more with the cursor', async () => {
    mockFetch({
      '/api/v1/feed': { status: 200, body: { items: [diary('2026-11-03', 'みっかめ')], nextCursor: 'abc' } },
      '/api/v1/feed?cursor=abc': { status: 200, body: { items: [diary('2026-11-01', 'ついたち')], nextCursor: null } },
    });
    renderAt('/feed');
    expect(await screen.findByText('みっかめ')).toBeTruthy();
    expect(screen.getAllByText('きゃろる').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'もっと見る' }));
    expect(await screen.findByText('ついたち')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'もっと見る' })).toBeNull();
  });

  it('explains what to do when the feed is empty', async () => {
    mockFetch({ '/api/v1/feed': { status: 200, body: { items: [], nextCursor: null } } });
    renderAt('/feed');
    expect(await screen.findByText(/まだ読める絵日記がありません/)).toBeTruthy();
  });

  it('shows an error instead of an empty list', async () => {
    mockFetch({ '/api/v1/feed': { status: 500, body: { type: 'server-error', title: 'サーバーでエラーが発生しました', status: 500 } } });
    renderAt('/feed');
    expect((await screen.findByRole('alert')).textContent).toContain('サーバーでエラー');
  });
});

describe('ConnectionsPage', () => {
  it('finds a user by exact ID and sends a follow request', async () => {
    const calls = mockFetch({
      ...emptyLists,
      '/api/v1/users/carol': { status: 200, body: { ...author, nickname: '<i>きゃろる</i>' } },
      'POST /api/v1/users/carol/follow': { status: 202 },
    });
    const { container } = renderAt('/connections');
    await userEvent.type(screen.getByLabelText('ID で検索'), 'carol');
    await userEvent.click(screen.getByRole('button', { name: '検索' }));
    expect(await screen.findByText('<i>きゃろる</i>')).toBeTruthy();
    expect(container.querySelector('i')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'フォローを申請' }));
    expect(await screen.findByText(/申請しました/)).toBeTruthy();
    expect(calls.some((c) => c.url === '/api/v1/users/carol/follow' && c.init?.method === 'POST')).toBe(true);
  });

  it('shows "not found" for unknown IDs', async () => {
    mockFetch({ ...emptyLists, '/api/v1/users/nobody': { status: 404, body: { type: 'not-found', title: '見つかりません', status: 404 } } });
    renderAt('/connections');
    await userEvent.type(screen.getByLabelText('ID で検索'), 'nobody');
    await userEvent.click(screen.getByRole('button', { name: '検索' }));
    expect((await screen.findByRole('alert')).textContent).toContain('見つかりません');
  });

  it('approves and rejects incoming requests', async () => {
    const calls = mockFetch({
      ...emptyLists,
      '/api/v1/me/followers': { status: 200, body: { approved: [], pending: [author, { handle: 'dave', nickname: 'でいぶ', hasAvatar: false }] } },
      'POST /api/v1/me/followers/carol/approve': { status: 204 },
      'DELETE /api/v1/me/followers/dave': { status: 204 },
    });
    renderAt('/connections');
    const requests = await screen.findByRole('region', { name: '承認待ちの申請' });
    const carol = within(requests).getByText('きゃろる').closest('li');
    const dave = within(requests).getByText('でいぶ').closest('li');
    if (!carol || !dave) throw new Error('li がありません');
    await userEvent.click(within(carol).getByRole('button', { name: '承認' }));
    await userEvent.click(within(dave).getByRole('button', { name: '拒否' }));
    const urls = calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`);
    expect(urls).toContain('POST /api/v1/me/followers/carol/approve');
    expect(urls).toContain('DELETE /api/v1/me/followers/dave');
  });

  it('blocks a follower after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const calls = mockFetch({
      ...emptyLists,
      '/api/v1/me/followers': { status: 200, body: { approved: [author], pending: [] } },
      'PUT /api/v1/me/blocks/carol': { status: 204 },
    });
    renderAt('/connections');
    const followers = await screen.findByRole('region', { name: 'フォロワー' });
    await userEvent.click(within(followers).getByRole('button', { name: 'ブロック' }));
    expect(calls.some((c) => c.url === '/api/v1/me/blocks/carol' && c.init?.method === 'PUT')).toBe(true);
  });
});

describe('UserPage', () => {
  it('lists the user’s diaries when allowed', async () => {
    mockFetch({
      '/api/v1/users/carol': { status: 200, body: author },
      '/api/v1/users/carol/diaries': { status: 200, body: { items: [diary('2026-11-01', 'ついたち')], nextCursor: null } },
    });
    renderAt('/users/carol');
    expect(await screen.findByRole('heading', { name: 'きゃろる' })).toBeTruthy();
    expect(await screen.findByText('ついたち')).toBeTruthy();
  });

  it('explains that diaries are visible only after approval', async () => {
    mockFetch({
      '/api/v1/users/carol': { status: 200, body: author },
      '/api/v1/users/carol/diaries': { status: 404, body: { type: 'not-found', title: '見つかりません', status: 404 } },
    });
    renderAt('/users/carol');
    expect(await screen.findByText(/承認されると/)).toBeTruthy();
  });
});
