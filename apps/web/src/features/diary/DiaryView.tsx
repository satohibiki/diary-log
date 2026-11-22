import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Diary } from '@diary/shared';
import { DiaryPage } from '../../components/DiaryPage.tsx';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { useMe } from '../../components/RequireAuth.tsx';
import { api } from '../../lib/api-client.ts';
import { formatDiaryDay, formatJapaneseDate } from '../../lib/dates.ts';
import { useAction } from '../../lib/use-action.ts';
import { WEATHER_ICONS, WEATHER_LABELS } from '../../lib/weather.ts';

export function DiaryCard({ diary }: { diary: Diary }) {
  const fullDate = formatJapaneseDate(diary.date);
  return (
    <DiaryPage
      heading={
        <header className="diary-page__heading">
          <h2>{fullDate}</h2>
          <p>{diary.author.nickname}</p>
        </header>
      }
      picture={<img src={diary.imageUrl} alt={`${fullDate}の絵`} />}
      day={formatDiaryDay(diary.date)}
      weather={
        <p className="diary-page__weather-text">
          <span className="diary-page__label">天気</span>
          <span aria-hidden="true">{WEATHER_ICONS[diary.weather]}</span> {WEATHER_LABELS[diary.weather]}
        </p>
      }
      body={
        <p className="ruled-text" aria-label="文章">
          {diary.body}
        </p>
      }
    />
  );
}

export function DiaryView() {
  const me = useMe();
  const navigate = useNavigate();
  const { handle = '', date = '' } = useParams();
  const [diary, setDiary] = useState<Diary | null>(null);

  const load = useAction(
    useCallback(async () => {
      setDiary(await api<Diary>(`/users/${handle}/diaries/${date}`));
    }, [handle, date]),
  );
  const { run } = load;
  useEffect(() => {
    void run();
  }, [run]);

  const remove = useAction(async () => {
    if (!window.confirm(`${formatJapaneseDate(date)}の絵日記を削除しますか? 削除すると元に戻せません。`)) return;
    await api(`/me/diaries/${date}`, { method: 'DELETE' });
    await navigate('/calendar', { replace: true });
  });

  return (
    <>
      <ErrorMessage error={load.error} />
      {diary && <DiaryCard diary={diary} />}
      {diary?.author.handle === me.handle && (
        <p className="diary-actions">
          <Link to={`/diaries/${date}/edit`}>編集する</Link>{' '}
          <button type="button" disabled={remove.pending} onClick={() => void remove.run()}>
            削除する
          </button>
        </p>
      )}
      <ErrorMessage error={remove.error} />
    </>
  );
}
