import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { WebAuthnOptions } from '@diary/shared';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { api, ApiError } from '../../lib/api-client.ts';
import { UserFacingError } from '../../lib/errors.ts';
import { passkeysSupported, getPasskey, type RequestJSON } from '../../lib/passkey.ts';
import { useAction } from '../../lib/use-action.ts';
import { PasswordInput } from './PasswordInput.tsx';
import { PasskeyUnsupported } from './Unsupported.tsx';

/** ID とパスワードのどちらが違うかを示さない(004 FR-005) */
const wrongCredentials = (error: unknown) =>
  error instanceof ApiError && error.status === 401 ? new UserFacingError('ID またはパスワードが正しくありません') : error;

/**
 * ログイン(004 FR-002、FR-012、FR-015)。ID とパスワードが標準で、パスキーは別のボタン。
 * 初めて使う端末では、メールのワンタイムパスワードを求める
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verifyingDevice, setVerifyingDevice] = useState(false);
  const supported = passkeysSupported();

  const withPassword = useAction(async () => {
    try {
      const res = await api<{ next: 'verify-device' } | undefined>('/auth/login/password', {
        method: 'POST',
        json: { handle, password },
      });
      if (res?.next === 'verify-device') {
        setVerifyingDevice(true);
        return;
      }
    } catch (error) {
      throw wrongCredentials(error);
    }
    await navigate('/', { replace: true });
  });
  const verifyDevice = useAction(async () => {
    await api('/auth/login/device/verify', { method: 'POST', json: { code } });
    await navigate('/', { replace: true });
  });
  const resend = useAction(async () => {
    await api('/auth/login/device/resend', { method: 'POST' });
  });
  const withPasskey = useAction(async () => {
    const { challengeId, options } = await api<WebAuthnOptions<RequestJSON>>('/auth/login/options', { method: 'POST' });
    const credential = await getPasskey(options);
    await api('/auth/login/verify', { method: 'POST', json: { handle, challengeId, credential } });
    await navigate('/', { replace: true });
  });

  if (verifyingDevice) {
    return (
      <main className="app-main auth">
        <h1>ログイン</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verifyDevice.run();
          }}
        >
          <p role="status">
            初めて使う端末です。登録済みのメールアドレスにワンタイムパスワードを送信しました。10分以内に入力してください。
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
            <button type="submit" className="primary" disabled={verifyDevice.pending}>
              確認する
            </button>{' '}
            <button type="button" disabled={resend.pending} onClick={() => void resend.run()}>
              メールを再送する
            </button>
          </p>
          <ErrorMessage error={verifyDevice.error ?? resend.error} />
        </form>
      </main>
    );
  }

  return (
    <main className="app-main auth">
      <h1>ログイン</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void withPassword.run();
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
        <PasswordInput id="password" label="パスワード" autoComplete="current-password" value={password} onChange={setPassword} />
        <p>
          <button type="submit" className="primary" disabled={withPassword.pending}>
            ログイン
          </button>
        </p>
        <ErrorMessage error={withPassword.error ?? withPasskey.error} />
      </form>
      <p>
        <button
          type="button"
          disabled={!supported || withPasskey.pending}
          aria-describedby={supported ? undefined : 'passkey-unsupported'}
          onClick={() => void withPasskey.run()}
        >
          パスキーでログイン
        </button>
      </p>
      {!supported && <PasskeyUnsupported id="passkey-unsupported" />}
      <p>
        <Link to="/recover">パスワードを忘れた場合、パスキーを使えない場合はこちら</Link>
      </p>
      <p>
        はじめての方は <Link to="/signup">アカウントを作成</Link>
      </p>
    </main>
  );
}
