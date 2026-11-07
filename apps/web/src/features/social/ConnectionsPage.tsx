import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { FollowList, UserSummary } from '@diary/shared';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { api } from '../../lib/api-client.ts';
import { useAction } from '../../lib/use-action.ts';

type Lists = { following: FollowList; followers: FollowList; blocks: UserSummary[] };
type Action = { label: string; run: (user: UserSummary) => Promise<void>; confirm?: (user: UserSummary) => string };

function UserList({ title, users, actions, empty }: { title: string; users: UserSummary[]; actions: Action[]; empty: string }) {
  const id = `list-${title}`;
  const act = useAction(async (action: Action, user: UserSummary) => {
    if (action.confirm && !window.confirm(action.confirm(user))) return;
    await action.run(user);
  });
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {users.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.handle}>
              <Link to={`/users/${u.handle}`}>{u.nickname}</Link> <small>@{u.handle}</small>{' '}
              {actions.map((a) => (
                <button key={a.label} type="button" disabled={act.pending} onClick={() => void act.run(a, u)}>
                  {a.label}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
      <ErrorMessage error={act.error} />
    </section>
  );
}

export function ConnectionsPage() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<UserSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useAction(
    useCallback(async () => {
      const [following, followers, blocks] = await Promise.all([
        api<FollowList>('/me/following'),
        api<FollowList>('/me/followers'),
        api<UserSummary[]>('/me/blocks'),
      ]);
      setLists({ following, followers, blocks });
    }, []),
  );
  const { run: reload } = load;
  useEffect(() => {
    void reload();
  }, [reload]);

  const search = useAction(async () => {
    setFound(null);
    setNotice(null);
    setFound(await api<UserSummary>(`/users/${encodeURIComponent(query)}`));
  });
  const request = useAction(async (user: UserSummary) => {
    await api(`/users/${user.handle}/follow`, { method: 'POST' });
    setNotice(`${user.nickname} さんにフォローを申請しました。承認されると絵日記を読めます`);
    await reload();
  });

  const call = (method: string, path: (u: UserSummary) => string) => async (u: UserSummary) => {
    await api(path(u), { method });
    await reload();
  };
  const blockAction: Action = {
    label: 'ブロック',
    run: call('PUT', (u) => `/me/blocks/${u.handle}`),
    confirm: (u) => `${u.nickname} さんをブロックしますか? お互いのフォローが解除され、相手はあなたの絵日記を読めなくなります。`,
  };

  return (
    <div className="connections">
      <h1>フォロー</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search.run();
        }}
      >
        <label htmlFor="search-handle">ID で検索</label>
        <input
          id="search-handle"
          type="text"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.trim());
          }}
        />{' '}
        <button type="submit" disabled={search.pending}>
          検索
        </button>
      </form>
      <ErrorMessage error={search.error} />
      {found && (
        <p className="search-result">
          <span>{found.nickname}</span> <small>@{found.handle}</small>{' '}
          <button type="button" disabled={request.pending} onClick={() => void request.run(found)}>
            フォローを申請
          </button>
        </p>
      )}
      <ErrorMessage error={request.error} />
      {notice && <p role="status">{notice}</p>}

      <ErrorMessage error={load.error} />
      {lists && (
        <>
          <UserList
            title="承認待ちの申請"
            users={lists.followers.pending}
            empty="承認待ちの申請はありません"
            actions={[
              { label: '承認', run: call('POST', (u) => `/me/followers/${u.handle}/approve`) },
              { label: '拒否', run: call('DELETE', (u) => `/me/followers/${u.handle}`) },
              blockAction,
            ]}
          />
          <UserList
            title="フォロワー"
            users={lists.followers.approved}
            empty="フォロワーはいません"
            actions={[
              {
                label: '削除',
                run: call('DELETE', (u) => `/me/followers/${u.handle}`),
                confirm: (u) => `${u.nickname} さんをフォロワーから削除しますか?`,
              },
              blockAction,
            ]}
          />
          <UserList
            title="フォロー中"
            users={lists.following.approved}
            empty="フォロー中の人はいません"
            actions={[{ label: '解除', run: call('DELETE', (u) => `/users/${u.handle}/follow`) }]}
          />
          <UserList
            title="申請中"
            users={lists.following.pending}
            empty="申請中のフォローはありません"
            actions={[{ label: '取り消し', run: call('DELETE', (u) => `/users/${u.handle}/follow`) }]}
          />
          <UserList
            title="ブロック中"
            users={lists.blocks}
            empty="ブロック中の人はいません"
            actions={[{ label: 'ブロックを解除', run: call('DELETE', (u) => `/me/blocks/${u.handle}`) }]}
          />
        </>
      )}
    </div>
  );
}
