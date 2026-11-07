import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/features/auth/LoginPage.tsx';
import { SignupPage } from '../src/features/auth/SignupPage.tsx';
import { RecoveryPage } from '../src/features/auth/RecoveryPage.tsx';
import { mockFetch } from './helpers.ts';

const webauthn = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startAuthentication: vi.fn(() => Promise.resolve({ id: 'cred', rawId: 'cred', type: 'public-key', response: {} })),
  startRegistration: vi.fn(() => Promise.resolve({ id: 'cred', rawId: 'cred', type: 'public-key', response: {} })),
}));
vi.mock('@simplewebauthn/browser', () => webauthn);

beforeEach(() => {
  webauthn.browserSupportsWebAuthn.mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/recover" element={<RecoveryPage />} />
        <Route path="/" element={<p>ホーム画面</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const options = { status: 200, body: { challengeId: 'c1', options: { challenge: 'x' } } };

describe('LoginPage', () => {
  it('has no password field', () => {
    renderAt('/login');
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByLabelText('ID')).toBeTruthy();
  });

  it('signs in with ID and passkey and goes home', async () => {
    const calls = mockFetch({ 'POST /api/v1/auth/login/options': options, 'POST /api/v1/auth/login/verify': { status: 204 } });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.click(screen.getByRole('button', { name: 'パスキーでログイン' }));
    expect(await screen.findByText('ホーム画面')).toBeTruthy();
    expect(webauthn.startAuthentication).toHaveBeenCalledOnce();
    expect(JSON.parse(calls[1]?.init?.body as string)).toMatchObject({ handle: 'alice', challengeId: 'c1' });
  });

  it('shows the failure and offers only the recovery path', async () => {
    mockFetch({
      'POST /api/v1/auth/login/options': options,
      'POST /api/v1/auth/login/verify': { status: 401, body: { type: 'authentication-failed', title: '認証できませんでした', status: 401 } },
    });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.click(screen.getByRole('button', { name: 'パスキーでログイン' }));
    expect((await screen.findByRole('alert')).textContent).toContain('認証できませんでした');
    expect(screen.getByRole('link', { name: /パスキーを使えない/ }).getAttribute('href')).toBe('/recover');
  });

  it('explains that passkeys are unsupported instead of offering a password', () => {
    webauthn.browserSupportsWebAuthn.mockReturnValue(false);
    renderAt('/login');
    expect(screen.getByText(/パスキーに対応していません/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'パスキーでログイン' })).toBeNull();
  });
});

describe('SignupPage', () => {
  it('registers with ID, email, one-time password, and passkey', async () => {
    const calls = mockFetch({
      'POST /api/v1/auth/registration/start': { status: 202, body: { registrationId: 'r1' } },
      'POST /api/v1/auth/registration/verify-email': options,
      'POST /api/v1/auth/registration/finish': { status: 201, body: {} },
    });
    renderAt('/signup');
    expect(document.querySelector('input[type="password"]')).toBeNull();
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: '確認メールを送る' }));
    await userEvent.type(await screen.findByLabelText('ワンタイムパスワード'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: 'パスキーを作成して登録' }));
    expect(await screen.findByText('ホーム画面')).toBeTruthy();
    expect(webauthn.startRegistration).toHaveBeenCalledOnce();
    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/auth/registration/start',
      '/api/v1/auth/registration/verify-email',
      '/api/v1/auth/registration/finish',
    ]);
  });

  it('shows field errors from the server', async () => {
    mockFetch({
      'POST /api/v1/auth/registration/start': {
        status: 409,
        body: { type: 'handle-taken', title: 'この ID は既に使われています', status: 409 },
      },
    });
    renderAt('/signup');
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: '確認メールを送る' }));
    expect((await screen.findByRole('alert')).textContent).toContain('既に使われています');
  });

  it('links to the privacy explanation before signing up', () => {
    renderAt('/signup');
    expect(screen.getByRole('link', { name: /データの取り扱い/ }).getAttribute('href')).toBe('/privacy');
  });
});

describe('RecoveryPage', () => {
  it('recovers with ID and one-time password, then registers a new passkey', async () => {
    mockFetch({
      'POST /api/v1/auth/recovery/start': { status: 202 },
      'POST /api/v1/auth/recovery/verify': options,
      'POST /api/v1/auth/recovery/finish': { status: 204 },
    });
    renderAt('/recover');
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.click(screen.getByRole('button', { name: '復旧用のメールを送る' }));
    expect(await screen.findByText(/登録済みのメールアドレスに送信しました/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('ワンタイムパスワード'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: '新しいパスキーを登録' }));
    expect(await screen.findByText('ホーム画面')).toBeTruthy();
    expect(webauthn.startRegistration).toHaveBeenCalledOnce();
  });
});
