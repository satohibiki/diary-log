import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { BODY_MAX, graphemeLength, IMAGE_MAX_BYTES, WEATHERS, type Diary, type Weather } from '@diary/shared';
import { DiaryPage } from '../../components/DiaryPage.tsx';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { useMe } from '../../components/RequireAuth.tsx';
import { api, ApiError } from '../../lib/api-client.ts';
import { formatDiaryDay, todayLocal } from '../../lib/dates.ts';
import { clearDraft, loadDraft, saveDraft } from '../../lib/draft-store.ts';
import { UserFacingError } from '../../lib/errors.ts';
import { ruledHeight } from '../../lib/ruled-lines.ts';
import { WEATHER_LABELS } from '../../lib/weather.ts';

const DRAFT_DELAY_MS = 500;

export function DiaryEditor() {
  const me = useMe();
  const navigate = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const editing = params.date !== undefined;
  const slot = params.date ?? 'new';
  const today = todayLocal();

  const [date, setDate] = useState(params.date ?? search.get('date') ?? today);
  const [body, setBody] = useState('');
  const [weather, setWeather] = useState<Weather | ''>('');
  const [image, setImage] = useState<Blob | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  // 下書き、または編集する絵日記を読み込む
  useEffect(() => {
    const state = { active: true };
    (async () => {
      const draft = await loadDraft(me.handle, slot);
      if (editing) {
        const diary = await api<Diary>(`/users/${me.handle}/diaries/${slot}`);
        if (!state.active) return;
        setExistingImageUrl(diary.imageUrl);
        setBody(diary.body);
        setWeather(diary.weather);
      }
      if (draft && state.active) {
        setDate(editing ? slot : draft.date);
        setBody(draft.body);
        setWeather(draft.weather as Weather | '');
        setImage(draft.image);
      }
    })()
      .catch((e: unknown) => {
        if (state.active) setError(e);
      })
      .finally(() => {
        if (state.active) setLoaded(true);
      });
    return () => {
      state.active = false;
    };
  }, [me.handle, slot, editing]);

  // 入力の500ms後に下書きを保存する
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      saveDraft(me.handle, slot, { date, body, weather, image }).catch((e: unknown) => {
        setError(e);
      });
    }, DRAFT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [loaded, me.handle, slot, date, body, weather, image]);

  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const remaining = BODY_MAX - graphemeLength(body);

  // 文章欄の高さを、文章が収まる罫線の行数に合わせる(最小8行。002 FR-009)
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const fit = () => {
      try {
        el.style.height = '0px';
        el.style.height = `${String(ruledHeight(el.scrollHeight, parseFloat(getComputedStyle(el).lineHeight)))}px`;
      } catch (e) {
        el.style.height = '';
        setError(e);
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
    };
  }, [body, loaded]);

  const submit = async () => {
    const missing: string[] = [];
    if (!image && !editing) missing.push('絵(画像)');
    if (body.trim() === '') missing.push('文章');
    if (weather === '') missing.push('天気');
    if (missing.length > 0) {
      setError(new UserFacingError(`次の項目を入力してください: ${missing.join('、')}`));
      return;
    }
    if (remaining < 0) {
      setError(new UserFacingError(`文章は${String(BODY_MAX)}文字までです`));
      return;
    }
    if (date > today) {
      setError(new UserFacingError('未来の日付は選べません'));
      return;
    }
    const form = new FormData();
    form.set('body', body);
    form.set('weather', weather);
    if (image) form.set('image', image, 'image');
    if (!editing) form.set('date', date);
    setSaving(true);
    setError(null);
    try {
      await (editing
        ? api(`/me/diaries/${slot}`, { method: 'PUT', form })
        : api('/me/diaries', { method: 'POST', form }));
      await clearDraft(me.handle, slot);
      await navigate(`/users/${me.handle}/diaries/${date}`, { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const exists = error instanceof ApiError && error.problem.type === 'diary-exists';

  return (
    <form
      className="diary-editor"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h1>{editing ? '絵日記を編集' : '絵日記を書く'}</h1>
      <DiaryPage
        heading={<p className="diary-page__year">{date.slice(0, 4)}年</p>}
        picture={
          <>
            {(preview ?? existingImageUrl) ? (
              <img src={preview ?? existingImageUrl ?? ''} alt="選んだ絵" />
            ) : (
              <p className="diary-page__placeholder">絵を選んでください</p>
            )}
            <div className="diary-page__picture-input">
              <label htmlFor="diary-image">絵(画像)</label>
              <input
                id="diary-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > IMAGE_MAX_BYTES) {
                    setError(new UserFacingError('画像は10MB までです'));
                    e.target.value = '';
                    return;
                  }
                  setImage(file);
                }}
              />
            </div>
          </>
        }
        day={
          <>
            <label htmlFor="diary-date" className="visually-hidden">
              日付
            </label>
            <span aria-hidden="true">{formatDiaryDay(date)}</span>
            <input
              id="diary-date"
              type="date"
              required
              max={today}
              value={date}
              disabled={editing}
              onClick={(e) => {
                // 欄のどこを押しても日付の選択を開く(キーボードでは入力欄をそのまま操作できる)
                e.currentTarget.showPicker();
              }}
              onChange={(e) => {
                setDate(e.target.value);
              }}
            />
          </>
        }
        weather={
          <fieldset>
            <legend>天気</legend>
            {WEATHERS.map((w) => (
              <label key={w}>
                <input
                  type="radio"
                  name="weather"
                  value={w}
                  checked={weather === w}
                  onChange={() => {
                    setWeather(w);
                  }}
                />
                {WEATHER_LABELS[w]}
              </label>
            ))}
          </fieldset>
        }
        body={
          <>
            <label htmlFor="diary-body" className="visually-hidden">
              文章
            </label>
            <textarea
              id="diary-body"
              ref={bodyRef}
              className="ruled-text"
              value={body}
              aria-describedby="diary-remaining"
              onChange={(e) => {
                setBody(e.target.value);
              }}
            />
          </>
        }
      />
      <p id="diary-remaining" aria-live="polite" className={remaining < 0 ? 'error' : undefined}>
        残り {remaining} 文字
      </p>

      <p>
        <button type="submit" className="primary" disabled={saving || !loaded}>
          保存する
        </button>
      </p>
      <ErrorMessage error={error} />
      {exists && (
        <p>
          <Link to={`/diaries/${date}/edit`}>その日の絵日記を編集する</Link>
        </p>
      )}
    </form>
  );
}
