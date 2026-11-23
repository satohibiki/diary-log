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

// 004 FR-002、FR-012: ID とパスワードが標準。パスキーは別のボタンで、非対応ならボタンだけを無効にする。
// 「パスワードの欄がない」「非対応なら画面全体を非対応にする」テストは、仕様の変更により書き換えた
describe('LoginPage', () => {
  const failed = { status: 401, body: { type: 'authentication-failed', title: '認証できませんでした', status: 401 } };

  it('shows the ID and password fields first, and the passkey as a separate button', () => {
    renderAt('/login');
    const password = screen.getByLabelText('パスワード');
    expect(screen.getByLabelText('ID')).toBeTruthy();
    expect(password.getAttribute('type')).toBe('password');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'パスキーでログイン' })).toBeTruthy();
  });

  it('shows and hides the password', async () => {
    renderAt('/login');
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを表示' }));
    expect(screen.getByLabelText('パスワード').getAttribute('type')).toBe('text');
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを表示' }));
    expect(screen.getByLabelText('パスワード').getAttribute('type')).toBe('password');
  });

  it('signs in with ID and password on a trusted device', async () => {
    const calls = mockFetch({ 'POST /api/v1/auth/login/password': { status: 204 } });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.type(screen.getByLabelText('パスワード'), 'correct horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }));
    expect(await screen.findByText('ホーム画面')).toBeTruthy();
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ handle: 'alice', password: 'correct horse battery staple' });
  });

  it('asks a new device for the one-time password', async () => {
    const calls = mockFetch({
      'POST /api/v1/auth/login/password': { status: 202, body: { next: 'verify-device' } },
      'POST /api/v1/auth/login/device/resend': { status: 202 },
      'POST /api/v1/auth/login/device/verify': { status: 204 },
    });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.type(screen.getByLabelText('パスワード'), 'correct horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }));
    expect(await screen.findByText(/初めて使う端末です/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'メールを再送する' }));
    await userEvent.type(screen.getByLabelText('ワンタイムパスワード'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: '確認する' }));
    expect(await screen.findByText('ホーム画面')).toBeTruthy();
    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/auth/login/password',
      '/api/v1/auth/login/device/resend',
      '/api/v1/auth/login/device/verify',
    ]);
  });

  it('does not tell which of the ID and the password was wrong, and offers recovery', async () => {
    mockFetch({ 'POST /api/v1/auth/login/password': failed });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.type(screen.getByLabelText('パスワード'), 'wrong horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }));
    expect((await screen.findByRole('alert')).textContent).toBe('ID またはパスワードが正しくありません');
    expect(screen.getByRole('link', { name: /パスワードを忘れた/ }).getAttribute('href')).toBe('/recover');
  });

  it('still signs in with a passkey', async () => {
    const calls = mockFetch({ 'POST /api/v1/auth/login/options': options, 'POST /api/v1/auth/login/verify': { status: 204 } });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.click(screen.getByRole('button', { name: 'パスキーでログイン' }));
    expect(await screen.findByText('ホーム画面')).toBeTruthy();
    expect(webauthn.startAuthentication).toHaveBeenCalledOnce();
    expect(JSON.parse(calls[1]?.init?.body as string)).toMatchObject({ handle: 'alice', challengeId: 'c1' });
  });

  it('disables only the passkey button when passkeys are unsupported', async () => {
    webauthn.browserSupportsWebAuthn.mockReturnValue(false);
    mockFetch({ 'POST /api/v1/auth/login/password': { status: 204 } });
    renderAt('/login');
    const passkey = screen.getByRole<HTMLButtonElement>('button', { name: 'パスキーでログイン' });
    expect(passkey.disabled).toBe(true);
    expect(screen.getByText('このブラウザはパスキーに対応していません')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.type(screen.getByLabelText('パスワード'), 'correct horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }));
    expect(await screen.findByText('ホーム画面')).toBeTruthy();
  });
});

// 004 FR-001: 登録はパスワードで行い、パスキーを求めない(パスキーでの登録のテストを書き換えた)
describe('SignupPage', () => {
  async function toPasswordStep() {
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: '確認メールを送る' }));
    await userEvent.type(await screen.findByLabelText('ワンタイムパスワード'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: 'メールアドレスを確認' }));
  }

  it('registers with ID, email, one-time password, and password', async () => {
    const calls = mockFetch({
      'POST /api/v1/auth/registration/start': { status: 202, body: { registrationId: 'r1' } },
      'POST /api/v1/auth/registration/verify-email': { status: 204 },
      'POST /api/v1/auth/registration/finish': { status: 201, body: {} },
    });
    renderAt('/signup');
    await toPasswordStep();
    const password = await screen.findByLabelText('パスワード');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByLabelText('パスワード(確認)').getAttribute('autocomplete')).toBe('new-password');
    await userEvent.type(password, 'correct horse battery staple');
    await userEvent.type(screen.getByLabelText('パスワード(確認)'), 'correct horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect(await screen.findByText(/パスキーを追加すると/)).toBeTruthy();
    expect(webauthn.startRegistration).not.toHaveBeenCalled();
    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/auth/registration/start',
      '/api/v1/auth/registration/verify-email',
      '/api/v1/auth/registration/finish',
    ]);
    expect(JSON.parse(calls[2]?.init?.body as string)).toEqual({ registrationId: 'r1', password: 'correct horse battery staple' });
  });

  it('does not send when the two passwords differ', async () => {
    const calls = mockFetch({
      'POST /api/v1/auth/registration/start': { status: 202, body: { registrationId: 'r1' } },
      'POST /api/v1/auth/registration/verify-email': { status: 204 },
    });
    renderAt('/signup');
    await toPasswordStep();
    await userEvent.type(await screen.findByLabelText('パスワード'), 'correct horse battery staple');
    await userEvent.type(screen.getByLabelText('パスワード(確認)'), 'correct horse battery stapler');
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect((await screen.findByRole('alert')).textContent).toContain('一致しません');
    expect(calls).toHaveLength(2);
  });

  it.each([
    ['common', 'よく使われるパスワードは使えません'],
    ['contains_handle', 'ID を含むパスワードは使えません'],
    ['too_small', 'パスワードは12文字以上にしてください'],
  ])('explains the password rule %s', async (code, message) => {
    mockFetch({
      'POST /api/v1/auth/registration/start': { status: 202, body: { registrationId: 'r1' } },
      'POST /api/v1/auth/registration/verify-email': { status: 204 },
      'POST /api/v1/auth/registration/finish': {
        status: 422,
        body: { type: 'validation', title: '入力内容を確認してください', status: 422, errors: [{ field: 'password', code }] },
      },
    });
    renderAt('/signup');
    await toPasswordStep();
    await userEvent.type(await screen.findByLabelText('パスワード'), 'passwordpassword');
    await userEvent.type(screen.getByLabelText('パスワード(確認)'), 'passwordpassword');
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect((await screen.findByRole('alert')).textContent).toContain(message);
  });

  it('can sign up where passkeys are unsupported', () => {
    webauthn.browserSupportsWebAuthn.mockReturnValue(false);
    renderAt('/signup');
    expect(screen.getByLabelText('ID')).toBeTruthy();
    expect(screen.queryByText(/パスキーに対応していません/)).toBeNull();
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

// 004 FR-009: OTP の後に、新しいパスワードの設定(既定)か新しいパスキーの登録を選ぶ。
// パスキーの登録のみを前提にしたテストを書き換えた
describe('RecoveryPage', () => {
  async function toChoice() {
    await userEvent.type(screen.getByLabelText('ID'), 'alice');
    await userEvent.click(screen.getByRole('button', { name: '復旧用のメールを送る' }));
    expect(await screen.findByText(/登録済みのメールアドレスに送信しました/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('ワンタイムパスワード'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: '確認する' }));
  }

  it('recovers with ID and one-time password, then sets a new password', async () => {
    const calls = mockFetch({
      'POST /api/v1/auth/recovery/start': { status: 202 },
      'POST /api/v1/auth/recovery/verify': { status: 204 },
      'POST /api/v1/auth/recovery/password': { status: 204 },
    });
    renderAt('/recover');
    await toChoice();
    const password = await screen.findByLabelText('新しいパスワード');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
    await userEvent.type(password, 'a brand new passphrase 2026');
    await userEvent.type(screen.getByLabelText('新しいパスワード(確認)'), 'a brand new passphrase 2026');
    await userEvent.click(screen.getByRole('button', { name: '新しいパスワードを設定' }));
    expect(await screen.findByText('ホーム画面')).toBeTruthy();
    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/auth/recovery/start',
      '/api/v1/auth/recovery/verify',
      '/api/v1/auth/recovery/password',
    ]);
    expect(webauthn.startRegistration).not.toHaveBeenCalled();
  });

  it('can register a new passkey instead where passkeys are supported', async () => {
    mockFetch({
      'POST /api/v1/auth/recovery/start': { status: 202 },
      'POST /api/v1/auth/recovery/verify': { status: 204 },
      'POST /api/v1/auth/recovery/passkey/options': options,
      'POST /api/v1/auth/recovery/finish': { status: 204 },
    });
    renderAt('/recover');
    await toChoice();
    await userEvent.click(await screen.findByRole('button', { name: '新しいパスキーを登録' }));
    expect(await screen.findByText('ホーム画面')).toBeTruthy();
    expect(webauthn.startRegistration).toHaveBeenCalledOnce();
  });

  it('offers only the password where passkeys are unsupported', async () => {
    webauthn.browserSupportsWebAuthn.mockReturnValue(false);
    mockFetch({
      'POST /api/v1/auth/recovery/start': { status: 202 },
      'POST /api/v1/auth/recovery/verify': { status: 204 },
    });
    renderAt('/recover');
    await toChoice();
    expect(await screen.findByLabelText('新しいパスワード')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '新しいパスキーを登録' })).toBeNull();
  });
});
