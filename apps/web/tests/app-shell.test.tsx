import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth, useMe } from '../src/components/RequireAuth.tsx';
import { ErrorMessage } from '../src/components/ErrorMessage.tsx';
import { ApiError } from '../src/lib/api-client.ts';
import { me, mockFetch } from './helpers.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function Home() {
  const user = useMe();
  return <p>ようこそ {user.nickname}</p>;
}

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<p>ログイン画面</p>} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('shows the page with the signed-in user', async () => {
    mockFetch({ '/api/v1/me': { status: 200, body: me } });
    renderGuarded();
    expect(await screen.findByText('ようこそ ありす')).toBeTruthy();
  });

  it('redirects to the login page when not signed in', async () => {
    mockFetch({ '/api/v1/me': { status: 401, body: { type: 'unauthorized', title: 'ログインが必要です', status: 401 } } });
    renderGuarded();
    expect(await screen.findByText('ログイン画面')).toBeTruthy();
  });

  it('shows the error instead of a blank page when the server fails', async () => {
    mockFetch({ '/api/v1/me': { status: 500, body: { type: 'server-error', title: 'サーバーでエラーが発生しました', status: 500 } } });
    renderGuarded();
    expect((await screen.findByRole('alert')).textContent).toContain('サーバーでエラーが発生しました');
  });
});

describe('ErrorMessage', () => {
  it('announces the problem title', () => {
    render(<ErrorMessage error={new ApiError(409, { type: 'diary-exists', title: 'その日付の絵日記は既にあります', status: 409 })} />);
    expect(screen.getByRole('alert').textContent).toContain('その日付の絵日記は既にあります');
  });

  it('shows a generic message for unexpected errors', () => {
    render(<ErrorMessage error={new Error('boom')} />);
    expect(screen.getByRole('alert').textContent).toContain('予期しないエラー');
  });

  it('renders nothing without an error', () => {
    const { container } = render(<ErrorMessage error={null} />);
    expect(container.textContent).toBe('');
  });
});
