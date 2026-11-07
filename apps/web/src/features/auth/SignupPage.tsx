import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { WebAuthnOptions } from '@diary/shared';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { api } from '../../lib/api-client.ts';
import { createPasskey, passkeysSupported, type CreationJSON } from '../../lib/passkey.ts';
import { useAction } from '../../lib/use-action.ts';
import { PasskeyUnsupported } from './Unsupported.tsx';

export function SignupPage() {
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [registrationId, setRegistrationId] = useState<string | null>(null);

  const start = useAction(async () => {
    const res = await api<{ registrationId: string }>('/auth/registration/start', { method: 'POST', json: { handle, email } });
    setRegistrationId(res.registrationId);
  });
  const resend = useAction(async () => {
    await api('/auth/registration/resend', { method: 'POST', json: { registrationId } });
  });
  const finish = useAction(async () => {
    const { challengeId, options } = await api<WebAuthnOptions<CreationJSON>>('/auth/registration/verify-email', {
      method: 'POST',
      json: { registrationId, code },
    });
    const credential = await createPasskey(options);
    await api('/auth/registration/finish', { method: 'POST', json: { challengeId, credential } });
    await navigate('/', { replace: true });
  });

  if (!passkeysSupported()) {
    return (
      <main className="app-main auth">
        <h1>アカウントを作成</h1>
        <PasskeyUnsupported />
      </main>
    );
  }

  return (
    <main className="app-main auth">
      <h1>アカウントを作成</h1>
      <p>
        パスワードは使いません。ID とパスキーでログインします。メールアドレスは、パスキーを使えなくなったときの復旧にのみ使います。
        <Link to="/privacy">データの取り扱いについて</Link>
      </p>
      {registrationId === null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void start.run();
          }}
        >
          <label htmlFor="handle">ID</label>
          <input
            id="handle"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            pattern="[a-z0-9_]{3,20}"
            aria-describedby="handle-help"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value.trim());
            }}
          />
          <p id="handle-help">半角の英小文字、数字、_ で3〜20文字</p>
          <label htmlFor="email">メールアドレス</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value.trim());
            }}
          />
          <p>
            <button type="submit" className="primary" disabled={start.pending}>
              確認メールを送る
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
          <p role="status">{email} にワンタイムパスワードを送信しました。10分以内に入力してください。</p>
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
              パスキーを作成して登録
            </button>{' '}
            <button type="button" disabled={resend.pending} onClick={() => void resend.run()}>
              メールを再送する
            </button>
          </p>
          <ErrorMessage error={finish.error ?? resend.error} />
        </form>
      )}
      <p>
        アカウントをお持ちの方は <Link to="/login">ログイン</Link>
      </p>
    </main>
  );
}
