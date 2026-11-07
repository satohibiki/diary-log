import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { WebAuthnOptions } from '@diary/shared';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { api } from '../../lib/api-client.ts';
import { passkeysSupported, getPasskey, type RequestJSON } from '../../lib/passkey.ts';
import { useAction } from '../../lib/use-action.ts';
import { PasskeyUnsupported } from './Unsupported.tsx';

export function LoginPage() {
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const { run, pending, error } = useAction(async () => {
    const { challengeId, options } = await api<WebAuthnOptions<RequestJSON>>('/auth/login/options', { method: 'POST' });
    const credential = await getPasskey(options);
    await api('/auth/login/verify', { method: 'POST', json: { handle, challengeId, credential } });
    await navigate('/', { replace: true });
  });

  return (
    <main className="app-main auth">
      <h1>ログイン</h1>
      {passkeysSupported() ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <label htmlFor="handle">ID</label>
          <input
            id="handle"
            type="text"
            autoComplete="username webauthn"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value.trim());
            }}
          />
          <p>
            <button type="submit" className="primary" disabled={pending}>
              パスキーでログイン
            </button>
          </p>
          <ErrorMessage error={error} />
        </form>
      ) : (
        <PasskeyUnsupported />
      )}
      <p>
        <Link to="/recover">パスキーを使えない場合はこちら</Link>
      </p>
      <p>
        はじめての方は <Link to="/signup">アカウントを作成</Link>
      </p>
    </main>
  );
}
