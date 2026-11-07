import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from '../src/features/profile/ProfilePage.tsx';
import { me, mockFetch } from './helpers.ts';

const state = vi.hoisted(() => ({ me: { handle: 'alice', nickname: '<b>ありす</b>', email: 'alice@example.com', visibility: 'private', hasAvatar: false }, setMe: vi.fn() }));
vi.mock('../src/components/RequireAuth.tsx', () => ({ useMe: () => state.me, useMeState: () => state }));
const webauthn = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startAuthentication: vi.fn(() => Promise.resolve({ id: 'a' })),
  startRegistration: vi.fn(() => Promise.resolve({ id: 'r' })),
}));
vi.mock('@simplewebauthn/browser', () => webauthn);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  state.setMe.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<p>ログイン画面</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProfilePage', () => {
  it('shows the nickname as plain text', () => {
    const { container } = renderPage();
    expect(screen.getByText('<b>ありす</b>')).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
  });

  it('asks for confirmation before making diaries public, mentioning past diaries', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const calls = mockFetch({ 'PATCH /api/v1/me': { status: 200, body: { ...me, visibility: 'public' } } });
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: /公開する/ }));
    expect(confirm.mock.calls[0]?.[0]).toContain('過去の絵日記');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ visibility: 'public' });
    expect(state.setMe).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'public' }));
  });

  it('does nothing when the confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const calls = mockFetch({});
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: /公開する/ }));
    expect(calls).toHaveLength(0);
  });

  it('logs out and goes to the login page', async () => {
    mockFetch({ 'POST /api/v1/auth/logout': { status: 204 } });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'ログアウト' }));
    expect(await screen.findByText('ログイン画面')).toBeTruthy();
  });

  it('deletes the account only after confirmation and re-authentication', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const calls = mockFetch({
      'POST /api/v1/auth/step-up/options': { status: 200, body: { challengeId: 'c', options: { challenge: 'x' } } },
      'POST /api/v1/auth/step-up/verify': { status: 204 },
      'DELETE /api/v1/me': { status: 204 },
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '退会する' }));
    expect(await screen.findByText('ログイン画面')).toBeTruthy();
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual([
      'POST /api/v1/auth/step-up/options',
      'POST /api/v1/auth/step-up/verify',
      'DELETE /api/v1/me',
    ]);
  });
});
