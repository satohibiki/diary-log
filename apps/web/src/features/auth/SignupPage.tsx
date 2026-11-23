import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { api } from '../../lib/api-client.ts';
import { useAction } from '../../lib/use-action.ts';
import { assertSamePassword, explainPasswordError } from './password-errors.ts';
import { PasswordInput } from './PasswordInput.tsx';

type Step = 'email' | 'code' | 'password' | 'done';

/** アカウントの作成(004 FR-001)。ID、メールアドレスの確認、パスワードで登録し、パスキーは求めない */
export function SignupPage() {
  const [step, setStep] = useState<Step>('email');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [registrationId, setRegistrationId] = useState<string | null>(null);

  const start = useAction(async () => {
    const res = await api<{ registrationId: string }>('/auth/registration/start', { method: 'POST', json: { handle, email } });
    setRegistrationId(res.registrationId);
    setStep('code');
  });
  const resend = useAction(async () => {
    await api('/auth/registration/resend', { method: 'POST', json: { registrationId } });
  });
  const verify = useAction(async () => {
    await api('/auth/registration/verify-email', { method: 'POST', json: { registrationId, code } });
    setStep('password');
  });
  const finish = useAction(async () => {
    assertSamePassword(password, confirmation);
    try {
      await api('/auth/registration/finish', { method: 'POST', json: { registrationId, password } });
    } catch (error) {
      throw explainPasswordError(error);
    }
    setStep('done');
  });

  return (
    <main className="app-main auth">
      <h1>アカウントを作成</h1>
      {step === 'email' && (
        <>
          <p>
            ID とパスワードでログインします。メールアドレスは、初めて使う端末での確認と、パスワードを忘れたときの復旧にのみ使います。
            <Link to="/privacy">データの取り扱いについて</Link>
          </p>
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
        </>
      )}
      {step === 'code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify.run();
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
            <button type="submit" className="primary" disabled={verify.pending}>
              メールアドレスを確認
            </button>{' '}
            <button type="button" disabled={resend.pending} onClick={() => void resend.run()}>
              メールを再送する
            </button>
          </p>
          <ErrorMessage error={verify.error ?? resend.error} />
        </form>
      )}
      {step === 'password' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void finish.run();
          }}
        >
          {/* パスワード管理ツールが ID と結びつけられるよう、ID を読み取り専用で置く */}
          <input type="text" autoComplete="username" value={handle} readOnly hidden />
          <PasswordInput
            id="password"
            label="パスワード"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            describedBy="password-help"
          />
          <p id="password-help">12文字以上。日本語や空白も使えます。よく使われるパスワードと、ID を含むパスワードは使えません。</p>
          <PasswordInput
            id="password-confirmation"
            label="パスワード(確認)"
            autoComplete="new-password"
            value={confirmation}
            onChange={setConfirmation}
          />
          <p>
            <button type="submit" className="primary" disabled={finish.pending}>
              登録する
            </button>
          </p>
          <ErrorMessage error={finish.error} />
        </form>
      )}
      {step === 'done' && (
        <>
          <p role="status">アカウントを作成しました。</p>
          <p>セキュリティ設定でパスキーを追加すると、対応している端末ではパスワードなしでログインできます。</p>
          <p>
            <Link to="/" replace>
              はじめる
            </Link>{' '}
            ・ <Link to="/settings/security">セキュリティ設定</Link>
          </p>
        </>
      )}
      {step !== 'done' && (
        <p>
          アカウントをお持ちの方は <Link to="/login">ログイン</Link>
        </p>
      )}
    </main>
  );
}
