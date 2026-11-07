import { useCallback, useEffect, useState } from 'react';
import type { Diary, DiaryPage } from '@diary/shared';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { api, ApiError } from '../../lib/api-client.ts';
import { useAction } from '../../lib/use-action.ts';
import { DiaryCard } from '../diary/DiaryView.tsx';

type Props = { path: string; empty: string; notFound?: string };

/** カーソルで続きを読み込む絵日記の一覧 */
export function DiaryList({ path, empty, notFound }: Props) {
  const [items, setItems] = useState<Diary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = useAction(
    useCallback(
      async (next: string | null) => {
        try {
          const page = await api<DiaryPage>(next ? `${path}?cursor=${encodeURIComponent(next)}` : path);
          setItems((prev) => (next && prev ? [...prev, ...page.items] : page.items));
          setCursor(page.nextCursor);
        } catch (error) {
          if (notFound && error instanceof ApiError && error.status === 404) {
            setHidden(true);
            return;
          }
          throw error;
        }
      },
      [path, notFound],
    ),
  );
  const { run } = load;
  useEffect(() => {
    void run(null);
  }, [run]);

  if (hidden) return <p>{notFound}</p>;
  return (
    <>
      {items?.length === 0 && <p>{empty}</p>}
      {items?.map((d) => <DiaryCard key={`${d.author.handle}-${d.date}`} diary={d} />)}
      <ErrorMessage error={load.error} />
      {cursor && (
        <p>
          <button type="button" disabled={load.pending} onClick={() => void run(cursor)}>
            もっと見る
          </button>
        </p>
      )}
    </>
  );
}
