import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { WebAuthnOptions } from '@diary/shared';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { api } from '../../lib/api-client.ts';
import { createPasskey, passkeysSupported, type CreationJSON } from '../../lib/passkey.ts';
import { useAction } from '../../lib/use-action.ts';
import { PasskeyUnsupported } from './Unsupported.tsx';

export function RecoveryPage() {
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);

  const start = useAction(async () => {
    await api('/auth/recovery/start', { method: 'POST', json: { handle } });
    setSent(true);
  });
  const finish = useAction(async () => {
    const { challengeId, options } = await api<WebAuthnOptions<CreationJSON>>('/auth/recovery/verify', {
      method: 'POST',
      json: { handle, code },
    });
    const credential = await createPasskey(options);
    await api('/auth/recovery/finish', { method: 'POST', json: { challengeId, credential } });
    await navigate('/', { replace: true });
  });

  return (
    <main className="app-main auth">
      <h1>アカウントの復旧</h1>
      {!passkeysSupported() ? (
        <PasskeyUnsupported />
      ) : !sent ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void start.run();
          }}
        >
          <p>登録済みのメールアドレスにワンタイムパスワードを送ります。復旧後は新しいパスキーを登録します。</p>
          <label htmlFor="handle">ID</label>
          <input
            id="handle"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value.trim());
            }}
          />
          <p>
            <button type="submit" className="primary" disabled={start.pending}>
              復旧用のメールを送る
            </button>
          </p>
          <ErrorMessage error={start.error} />
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void finish.run();
          }}
        >
          <p role="status">
            ID が登録されている場合は、登録済みのメールアドレスに送信しました。届かない場合は、少し待ってから再度お試しください。
          </p>
          <label htmlFor="code">ワンタイムパスワード</label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{8}"
            required
            value={code}
            onChange={(e) => {
              setCode(e.target.value.trim());
            }}
          />
          <p>
            <button type="submit" className="primary" disabled={finish.pending}>
              新しいパスキーを登録
            </button>{' '}
            <button type="button" disabled={start.pending} onClick={() => void start.run()}>
              メールを再送する
            </button>
          </p>
          <ErrorMessage error={finish.error ?? start.error} />
        </form>
      )}
      <p>
        <Link to="/login">ログインに戻る</Link>
      </p>
    </main>
  );
}
