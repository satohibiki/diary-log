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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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
