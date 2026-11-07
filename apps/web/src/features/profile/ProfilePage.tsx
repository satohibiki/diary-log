import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { IMAGE_MAX_BYTES, type Me, type Visibility } from '@diary/shared';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { useMeState } from '../../components/RequireAuth.tsx';
import { api, apiBlob } from '../../lib/api-client.ts';
import { clearAllDrafts } from '../../lib/draft-store.ts';
import { UserFacingError } from '../../lib/errors.ts';
import { stepUp } from '../../lib/passkey.ts';
import { useAction } from '../../lib/use-action.ts';
import { logout } from '../auth/logout.ts';
import { importDiaries, type ImportResult } from './import.ts';

export function ProfilePage() {
  const { me, setMe } = useMeState();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(me.nickname);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const saveNickname = useAction(async () => {
    setMe(await api<Me>('/me', { method: 'PATCH', json: { nickname } }));
    setNotice('ニックネームを保存しました');
  });

  const changeVisibility = useAction(async (visibility: Visibility) => {
    if (visibility === me.visibility) return;
    const message =
      visibility === 'public'
        ? '絵日記を公開します。過去の絵日記も含めて、承認したフォロワーが読めるようになります。よろしいですか?'
        : '絵日記を非公開にします。あなた以外は誰も読めなくなります。よろしいですか?';
    if (!window.confirm(message)) return;
    setMe(await api<Me>('/me', { method: 'PATCH', json: { visibility } }));
  });

  const uploadAvatar = useAction(async (file: File) => {
    if (file.size > IMAGE_MAX_BYTES) throw new UserFacingError('画像は10MB までです');
    const form = new FormData();
    form.set('image', file);
    await api('/me/avatar', { method: 'PUT', form });
    setMe({ ...me, hasAvatar: true });
    setAvatarVersion((v) => v + 1);
  });

  const removeAvatar = useAction(async () => {
    await api('/me/avatar', { method: 'DELETE' });
    setMe({ ...me, hasAvatar: false });
  });

  const exportAll = useAction(async () => {
    const blob = await apiBlob('/me/export');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diary-export-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const runImport = useAction(async (file: File) => {
    setImportResult(null);
    setImportResult(
      await importDiaries(file, (done, total) => {
        setProgress(`${String(done)} / ${String(total)} 件を処理しました`);
      }),
    );
    setProgress(null);
  });

  const signOut = useAction(async () => {
    await logout();
    await navigate('/login', { replace: true });
  });

  const deleteAccount = useAction(async () => {
    if (!window.confirm('退会すると、すべての絵日記、画像、プロフィール、フォロー関係が削除され、元に戻せません。退会しますか?')) {
      return;
    }
    await stepUp();
    await api('/me', { method: 'DELETE' });
    // サーバー側のセッションは退会と同時に削除される。端末の下書きも消去する
    await clearAllDrafts();
    await navigate('/login', { replace: true });
  });

  return (
    <div className="profile">
      <h1>プロフィール</h1>
      <section aria-labelledby="profile-identity">
        <h2 id="profile-identity" className="nickname">
          {me.nickname}
        </h2>
        <p>ID: {me.handle}</p>
        {me.hasAvatar && <img className="avatar" src={`/api/v1/users/${me.handle}/avatar?v=${String(avatarVersion)}`} alt="プロフィール画像" />}
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveNickname.run();
        }}
      >
        <label htmlFor="nickname">ニックネーム</label>
        <input
          id="nickname"
          type="text"
          required
          maxLength={40}
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
          }}
        />
        <p>
          <button type="submit" disabled={saveNickname.pending}>
            ニックネームを保存
          </button>
        </p>
        <p className="hint">個人を特定できる情報(本名、住所、学校名など)は入れないでください。</p>
        <ErrorMessage error={saveNickname.error} />
      </form>

      <label htmlFor="avatar">プロフィール画像</label>
      <input
        id="avatar"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadAvatar.run(file);
          e.target.value = '';
        }}
      />
      {me.hasAvatar && (
        <p>
          <button type="button" onClick={() => void removeAvatar.run()}>
            プロフィール画像を削除
          </button>
        </p>
      )}
      <ErrorMessage error={uploadAvatar.error ?? removeAvatar.error} />

      <fieldset className="visibility">
        <legend>絵日記の公開設定</legend>
        <label className="weather-option">
          <input
            type="radio"
            name="visibility"
            checked={me.visibility === 'private'}
            onChange={() => void changeVisibility.run('private')}
          />
          公開しない(自分だけ)
        </label>
        <label className="weather-option">
          <input
            type="radio"
            name="visibility"
            checked={me.visibility === 'public'}
            onChange={() => void changeVisibility.run('public')}
          />
          公開する(承認したフォロワーのみ)
        </label>
      </fieldset>
      <ErrorMessage error={changeVisibility.error} />

      <h2>データ</h2>
      <p>
        <button type="button" disabled={exportAll.pending} onClick={() => void exportAll.run()}>
          すべての絵日記をエクスポート
        </button>
      </p>
      <ErrorMessage error={exportAll.error} />
      <label htmlFor="import">エクスポートしたファイルからインポート</label>
      <input
        id="import"
        type="file"
        accept=".zip,application/zip"
        disabled={runImport.pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void runImport.run(file);
          e.target.value = '';
        }}
      />
      {progress && <p aria-live="polite">{progress}</p>}
      {importResult && (
        <div role="status">
          <p>
            取り込み: {importResult.created} 件、スキップ(同じ日付があるため): {importResult.skipped} 件、失敗: {importResult.failed.length} 件
          </p>
          {importResult.failed.length > 0 && (
            <ul>
              {importResult.failed.map((f) => (
                <li key={f.date}>
                  {f.date}: {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ErrorMessage error={runImport.error} />

      <h2>アカウント</h2>
      <p>
        <Link to="/settings/security">パスキーとメールアドレスの管理</Link>
      </p>
      <p>
        <Link to="/privacy">データの取り扱いについて</Link>
      </p>
      <p>
        <button type="button" disabled={signOut.pending} onClick={() => void signOut.run()}>
          ログアウト
        </button>
      </p>
      <ErrorMessage error={signOut.error} />
      <p>
        <button type="button" disabled={deleteAccount.pending} onClick={() => void deleteAccount.run()}>
          退会する
        </button>
      </p>
      <ErrorMessage error={deleteAccount.error} />
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
