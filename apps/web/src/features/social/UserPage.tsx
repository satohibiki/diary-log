import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { UserSummary } from '@diary/shared';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { api } from '../../lib/api-client.ts';
import { useAction } from '../../lib/use-action.ts';
import { DiaryList } from './DiaryList.tsx';

export function UserPage() {
  const { handle = '' } = useParams();
  const [user, setUser] = useState<UserSummary | null>(null);
  const load = useAction(
    useCallback(async () => {
      setUser(await api<UserSummary>(`/users/${handle}`));
    }, [handle]),
  );
  const { run } = load;
  useEffect(() => {
    void run();
  }, [run]);

  return (
    <section>
      <ErrorMessage error={load.error} />
      {user && (
        <>
          <header className="user-header">
            {user.hasAvatar && <img className="avatar" src={`/api/v1/users/${user.handle}/avatar`} alt="" />}
            <h1>{user.nickname}</h1>
            <p>ID: {user.handle}</p>
          </header>
          <DiaryList
            path={`/users/${user.handle}/diaries`}
            empty="まだ絵日記がありません。"
            notFound="フォローの申請が承認されると、この人が公開している絵日記を読めます。"
          />
        </>
      )}
    </section>
  );
}
