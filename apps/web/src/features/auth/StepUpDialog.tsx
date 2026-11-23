import { useCallback, useId, useState, type ReactNode } from 'react';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { useMe } from '../../components/RequireAuth.tsx';
import { api, ApiError } from '../../lib/api-client.ts';
import { UserFacingError } from '../../lib/errors.ts';
import { stepUp as stepUpWithPasskey } from '../../lib/passkey.ts';
import { useAction } from '../../lib/use-action.ts';
import { PasswordInput } from './PasswordInput.tsx';

/**
 * 機密性の高い操作の前の本人確認(004 research.md §7)。
 * パスワードを持つ利用者はパスワードで、持たない利用者はパスキーで確認する。
 * stepUp() は確認できたら true、キャンセルされたら false を返す。失敗(パスキーの操作の失敗など)は例外にする
 */
export function useStepUp(): { stepUp: () => Promise<boolean>; dialog: ReactNode } {
  const me = useMe();
  const [resolve, setResolve] = useState<((ok: boolean) => void) | null>(null);

  const stepUp = useCallback(async (): Promise<boolean> => {
    if (!me.hasPassword) {
      await stepUpWithPasskey();
      return true;
    }
    return new Promise<boolean>((done) => {
      setResolve(() => done);
    });
  }, [me.hasPassword]);

  const dialog = resolve ? (
    <PasswordStepUp
      onDone={(ok) => {
        resolve(ok);
        setResolve(null);
      }}
    />
  ) : null;
  return { stepUp, dialog };
}

function PasswordStepUp({ onDone }: { onDone: (ok: boolean) => void }) {
  const [password, setPassword] = useState('');
  const headingId = useId();
  const inputId = useId();
  const confirm = useAction(async () => {
    try {
      await api('/auth/step-up/password', { method: 'POST', json: { password } });
    } catch (error) {
      throw error instanceof ApiError && error.status === 401 ? new UserFacingError('パスワードが正しくありません') : error;
    }
    onDone(true);
  });

  return (
    <section role="dialog" aria-labelledby={headingId} className="step-up">
      <h3 id={headingId}>本人確認</h3>
      <p>続けるには、現在のパスワードを入力してください。</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void confirm.run();
        }}
      >
        <PasswordInput id={inputId} label="パスワード" autoComplete="current-password" value={password} onChange={setPassword} />
        <p>
          <button type="submit" className="primary" disabled={confirm.pending}>
            確認する
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              onDone(false);
            }}
          >
            キャンセル
          </button>
        </p>
        <ErrorMessage error={confirm.error} />
      </form>
    </section>
  );
}
