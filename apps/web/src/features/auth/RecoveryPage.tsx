import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { WebAuthnOptions } from '@diary/shared';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { api } from '../../lib/api-client.ts';
import { createPasskey, passkeysSupported, type CreationJSON } from '../../lib/passkey.ts';
import { useAction } from '../../lib/use-action.ts';
import { assertSamePassword, explainPasswordError } from './password-errors.ts';
import { PasswordInput } from './PasswordInput.tsx';

type Step = 'start' | 'code' | 'choose';

/**
 * アカウントの復旧(004 FR-009)。ID とメールのワンタイムパスワードで本人確認をし、
 * 新しいパスワードを設定する(既定)か、対応環境では新しいパスキーを登録する
 */
export function RecoveryPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('start');
  const [handle, setHandle] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const supported = passkeysSupported();

  const start = useAction(async () => {
    await api('/auth/recovery/start', { method: 'POST', json: { handle } });
    setStep('code');
  });
  const verify = useAction(async () => {
    await api('/auth/recovery/verify', { method: 'POST', json: { handle, code } });
    setStep('choose');
  });
  const withPassword = useAction(async () => {
    assertSamePassword(password, confirmation);
    try {
      await api('/auth/recovery/password', { method: 'POST', json: { password } });
    } catch (error) {
      throw explainPasswordError(error);
    }
    await navigate('/', { replace: true });
  });
  const withPasskey = useAction(async () => {
    const { challengeId, options } = await api<WebAuthnOptions<CreationJSON>>('/auth/recovery/passkey/options', {
      method: 'POST',
    });
    const credential = await createPasskey(options);
    await api('/auth/recovery/finish', { method: 'POST', json: { challengeId, credential } });
    await navigate('/', { replace: true });
  });

  return (
    <main className="app-main auth">
      <h1>アカウントの復旧</h1>
      {step === 'start' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void start.run();
          }}
        >
          <p>
            登録済みのメールアドレスにワンタイムパスワードを送ります。確認できたら、新しいパスワードを設定します。復旧すると、ほかの端末はログアウトされます。
          </p>
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
      )}
      {step === 'code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify.run();
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
            <button type="submit" className="primary" disabled={verify.pending}>
              確認する
            </button>{' '}
            <button type="button" disabled={start.pending} onClick={() => void start.run()}>
              メールを再送する
            </button>
          </p>
          <ErrorMessage error={verify.error ?? start.error} />
        </form>
      )}
      {step === 'choose' && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void withPassword.run();
            }}
          >
            <input type="text" autoComplete="username" value={handle} readOnly hidden />
            <PasswordInput
              id="new-password"
              label="新しいパスワード"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              describedBy="new-password-help"
            />
            <p id="new-password-help">12文字以上。よく使われるパスワードと、ID を含むパスワードは使えません。</p>
            <PasswordInput
              id="new-password-confirmation"
              label="新しいパスワード(確認)"
              autoComplete="new-password"
              value={confirmation}
              onChange={setConfirmation}
            />
            <p>
              <button type="submit" className="primary" disabled={withPassword.pending}>
                新しいパスワードを設定
              </button>
            </p>
            <ErrorMessage error={withPassword.error} />
          </form>
          {supported && (
            <>
              <p>または、この端末でパスキーを登録して復旧することもできます。</p>
              <p>
                <button type="button" disabled={withPasskey.pending} onClick={() => void withPasskey.run()}>
                  新しいパスキーを登録
                </button>
              </p>
              <ErrorMessage error={withPasskey.error} />
            </>
          )}
        </>
      )}
      <p>
        <Link to="/login">ログインに戻る</Link>
      </p>
    </main>
  );
}
