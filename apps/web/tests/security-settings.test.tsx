import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecuritySettings } from '../src/features/auth/SecuritySettings.tsx';
import { mockFetch } from './helpers.ts';

const webauthn = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startAuthentication: vi.fn(() => Promise.resolve({ id: 'a' })),
  startRegistration: vi.fn(() => Promise.resolve({ id: 'r' })),
}));
vi.mock('@simplewebauthn/browser', () => webauthn);
const state = vi.hoisted(() => ({
  me: { handle: 'alice', nickname: 'ありす', email: 'alice@example.com', visibility: 'private', hasAvatar: false, hasPassword: false, passwordChangedAt: null as string | null },
  setMe: vi.fn(),
}));
vi.mock('../src/components/RequireAuth.tsx', () => ({ useMe: () => state.me, useMeState: () => state }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  state.me.hasPassword = false;
  state.me.passwordChangedAt = null;
});

const passkeys = [
  { id: 'p1', name: 'スマートフォン', createdAt: '2026-11-01T00:00:00Z', lastUsedAt: null },
];
const options = { status: 200, body: { challengeId: 'c', options: { challenge: 'x' } } };

function renderPage() {
  return render(
    <MemoryRouter>
      <SecuritySettings />
    </MemoryRouter>,
  );
}

describe('SecuritySettings', () => {
  it('lists passkeys', async () => {
    mockFetch({ '/api/v1/me/passkeys': { status: 200, body: passkeys } });
    renderPage();
    expect(await screen.findByText('スマートフォン')).toBeTruthy();
  });

  it('re-authenticates with a passkey before adding a new one', async () => {
    const calls = mockFetch({
      '/api/v1/me/passkeys': { status: 200, body: passkeys },
      'POST /api/v1/auth/step-up/options': options,
      'POST /api/v1/auth/step-up/verify': { status: 204 },
      'POST /api/v1/me/passkeys/options': options,
      'POST /api/v1/me/passkeys/finish': { status: 201, body: {} },
    });
    renderPage();
    await screen.findByText('スマートフォン');
    await userEvent.type(screen.getByLabelText('新しいパスキーの名前'), 'タブレット');
    await userEvent.click(screen.getByRole('button', { name: 'パスキーを追加' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    const urls = calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`);
    expect(urls.indexOf('POST /api/v1/auth/step-up/verify')).toBeLessThan(urls.indexOf('POST /api/v1/me/passkeys/options'));
    expect(webauthn.startRegistration).toHaveBeenCalledOnce();
  });

  it('shows why the last passkey cannot be deleted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockFetch({
      '/api/v1/me/passkeys': { status: 200, body: passkeys },
      'POST /api/v1/auth/step-up/options': options,
      'POST /api/v1/auth/step-up/verify': { status: 204 },
      'DELETE /api/v1/me/passkeys/p1': { status: 409, body: { type: 'last-passkey', title: '最後のパスキーは削除できません', status: 409 } },
    });
    renderPage();
    const item = (await screen.findByText('スマートフォン')).closest('li');
    if (!item) throw new Error('li がありません');
    await userEvent.click(within(item).getByRole('button', { name: '削除' }));
    expect((await screen.findByRole('alert')).textContent).toContain('最後のパスキー');
  });

  // 004: パスワードを持つ利用者は、パスワードで本人確認をする(research.md §7)
  it('re-authenticates with the password before adding a passkey when the user has one', async () => {
    state.me.hasPassword = true;
    const calls = mockFetch({
      '/api/v1/me/passkeys': { status: 200, body: [] },
      'POST /api/v1/auth/step-up/password': { status: 204 },
      'POST /api/v1/me/passkeys/options': options,
      'POST /api/v1/me/passkeys/finish': { status: 201, body: {} },
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'パスキーを追加' }));
    const dialog = await screen.findByRole('dialog', { name: '本人確認' });
    const password = within(dialog).getByLabelText('パスワード');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    await userEvent.type(password, 'correct horse battery staple');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認する' }));
    expect(await screen.findByText(/パスキーを追加しました/)).toBeTruthy();
    const urls = calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`);
    expect(urls.indexOf('POST /api/v1/auth/step-up/password')).toBeLessThan(urls.indexOf('POST /api/v1/me/passkeys/options'));
    expect(webauthn.startAuthentication).not.toHaveBeenCalled();
  });

  it('stops when the re-authentication is cancelled', async () => {
    state.me.hasPassword = true;
    const calls = mockFetch({ '/api/v1/me/passkeys': { status: 200, body: [] } });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'パスキーを追加' }));
    const dialog = await screen.findByRole('dialog', { name: '本人確認' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/me/passkeys']);
  });

  it('keeps the dialog open and shows the failure for a wrong password', async () => {
    state.me.hasPassword = true;
    mockFetch({
      '/api/v1/me/passkeys': { status: 200, body: [] },
      'POST /api/v1/auth/step-up/password': { status: 401, body: { type: 'authentication-failed', title: '認証できませんでした', status: 401 } },
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'パスキーを追加' }));
    const dialog = await screen.findByRole('dialog', { name: '本人確認' });
    await userEvent.type(within(dialog).getByLabelText('パスワード'), 'wrong horse battery staple');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認する' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('パスワードが正しくありません');
  });

  it('lets a user with a password delete the last passkey', async () => {
    state.me.hasPassword = true;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const calls = mockFetch({
      '/api/v1/me/passkeys': { status: 200, body: passkeys },
      'POST /api/v1/auth/step-up/password': { status: 204 },
      'DELETE /api/v1/me/passkeys/p1': { status: 204 },
    });
    renderPage();
    const item = (await screen.findByText('スマートフォン')).closest('li');
    if (!item) throw new Error('li がありません');
    await userEvent.click(within(item).getByRole('button', { name: '削除' }));
    const dialog = await screen.findByRole('dialog', { name: '本人確認' });
    await userEvent.type(within(dialog).getByLabelText('パスワード'), 'correct horse battery staple');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認する' }));
    expect(await screen.findByText('パスキーを削除しました')).toBeTruthy();
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true);
  });

  // 004 FR-007、FR-008、FR-016: パスワードの変更と設定
  it('changes the password with the current one', async () => {
    state.me.hasPassword = true;
    state.me.passwordChangedAt = '2026-11-01T00:00:00Z';
    const calls = mockFetch({
      '/api/v1/me/passkeys': { status: 200, body: [] },
      'PUT /api/v1/me/password': { status: 204 },
      '/api/v1/me': { status: 200, body: { ...state.me, passwordChangedAt: '2026-11-23T00:00:00Z' } },
    });
    renderPage();
    expect(screen.getByText(/最終変更: 2026\/11\/1/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('現在のパスワード'), 'correct horse battery staple');
    await userEvent.type(screen.getByLabelText('新しいパスワード'), 'a brand new passphrase 2026');
    await userEvent.type(screen.getByLabelText('新しいパスワード(確認)'), 'a brand new passphrase 2026');
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを変更' }));
    expect(await screen.findByText('パスワードを変更しました。ほかの端末はログアウトされました')).toBeTruthy();
    const put = calls.find((c) => c.init?.method === 'PUT');
    expect(JSON.parse(put?.init?.body as string)).toEqual({
      currentPassword: 'correct horse battery staple',
      newPassword: 'a brand new passphrase 2026',
    });
    expect(state.setMe).toHaveBeenCalled();
  });

  it('sets a password after a passkey check when the user has none', async () => {
    const calls = mockFetch({
      '/api/v1/me/passkeys': { status: 200, body: passkeys },
      'POST /api/v1/auth/step-up/options': options,
      'POST /api/v1/auth/step-up/verify': { status: 204 },
      'PUT /api/v1/me/password': { status: 204 },
      '/api/v1/me': { status: 200, body: { ...state.me, hasPassword: true } },
    });
    renderPage();
    expect(screen.queryByLabelText('現在のパスワード')).toBeNull();
    await userEvent.type(screen.getByLabelText('新しいパスワード'), 'a brand new passphrase 2026');
    await userEvent.type(screen.getByLabelText('新しいパスワード(確認)'), 'a brand new passphrase 2026');
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを設定' }));
    expect(await screen.findByText('パスワードを設定しました。ほかの端末はログアウトされました')).toBeTruthy();
    const urls = calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`);
    expect(urls.indexOf('POST /api/v1/auth/step-up/verify')).toBeLessThan(urls.indexOf('PUT /api/v1/me/password'));
    expect(JSON.parse(calls.find((c) => c.init?.method === 'PUT')?.init?.body as string)).toEqual({
      newPassword: 'a brand new passphrase 2026',
    });
  });

  it('changes the email after re-authentication and a one-time password', async () => {
    const calls = mockFetch({
      '/api/v1/me/passkeys': { status: 200, body: passkeys },
      'POST /api/v1/auth/step-up/options': options,
      'POST /api/v1/auth/step-up/verify': { status: 204 },
      'POST /api/v1/me/email-change/start': { status: 202 },
      'POST /api/v1/me/email-change/verify': { status: 204 },
    });
    renderPage();
    await userEvent.type(screen.getByLabelText('新しいメールアドレス'), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: '確認メールを送る' }));
    await userEvent.type(await screen.findByLabelText('ワンタイムパスワード'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: 'メールアドレスを変更' }));
    expect(await screen.findByText('メールアドレスを変更しました')).toBeTruthy();
    expect(calls.some((c) => c.url === '/api/v1/me/email-change/verify')).toBe(true);
  });
});
