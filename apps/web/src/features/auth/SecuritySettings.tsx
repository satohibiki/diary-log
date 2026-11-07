import { useCallback, useEffect, useState } from 'react';
import type { Passkey, WebAuthnOptions } from '@diary/shared';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { api } from '../../lib/api-client.ts';
import { createPasskey, stepUp, type CreationJSON } from '../../lib/passkey.ts';
import { useAction } from '../../lib/use-action.ts';

export function SecuritySettings() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useAction(
    useCallback(async () => {
      setPasskeys(await api<Passkey[]>('/me/passkeys'));
    }, []),
  );
  const { run: reload } = load;
  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useAction(async () => {
    await stepUp();
    const { challengeId, options } = await api<WebAuthnOptions<CreationJSON>>('/me/passkeys/options', { method: 'POST' });
    const credential = await createPasskey(options);
    await api('/me/passkeys/finish', { method: 'POST', json: { challengeId, credential, name: name || undefined } });
    setName('');
    setNotice('パスキーを追加しました。登録済みのメールアドレスに通知を送りました');
    await reload();
  });

  const remove = useAction(async (passkey: Passkey) => {
    if (!window.confirm(`パスキー「${passkey.name}」を削除しますか?`)) return;
    await stepUp();
    await api(`/me/passkeys/${passkey.id}`, { method: 'DELETE' });
    setNotice('パスキーを削除しました');
    await reload();
  });

  return (
    <section aria-labelledby="security-heading">
      <h2 id="security-heading">パスキーとメールアドレス</h2>
      <h3>パスキー</h3>
      <ErrorMessage error={load.error} />
      {passkeys && (
        <ul>
          {passkeys.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>{' '}
              <small>
                登録: {new Date(p.createdAt).toLocaleDateString('ja-JP')}
                {p.lastUsedAt && ` / 最終利用: ${new Date(p.lastUsedAt).toLocaleDateString('ja-JP')}`}
              </small>{' '}
              <button type="button" disabled={remove.pending} onClick={() => void remove.run(p)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add.run();
        }}
      >
        <label htmlFor="passkey-name">新しいパスキーの名前</label>
        <input
          id="passkey-name"
          type="text"
          maxLength={50}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <p>
          <button type="submit" disabled={add.pending}>
            パスキーを追加
          </button>
        </p>
      </form>
      {notice && <p role="status">{notice}</p>}
      <ErrorMessage error={add.error ?? remove.error} />
      <EmailChange />
    </section>
  );
}

function EmailChange() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);

  const start = useAction(async () => {
    await stepUp();
    await api('/me/email-change/start', { method: 'POST', json: { email } });
    setSent(true);
  });
  const verify = useAction(async () => {
    await api('/me/email-change/verify', { method: 'POST', json: { code } });
    setDone(true);
  });

  if (done) return <p role="status">メールアドレスを変更しました</p>;
  return (
    <>
      <h3>メールアドレスの変更</h3>
      {!sent ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void start.run();
          }}
        >
          <label htmlFor="new-email">新しいメールアドレス</label>
          <input
            id="new-email"
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value.trim());
            }}
          />
          <p>
            <button type="submit" disabled={start.pending}>
              確認メールを送る
            </button>
          </p>
          <ErrorMessage error={start.error} />
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify.run();
          }}
        >
          <label htmlFor="email-code">ワンタイムパスワード</label>
          <input
            id="email-code"
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
            <button type="submit" disabled={verify.pending}>
              メールアドレスを変更
            </button>
          </p>
          <ErrorMessage error={verify.error} />
        </form>
      )}
    </>
  );
}
