import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { BODY_MAX, graphemeLength, IMAGE_MAX_BYTES, WEATHERS, type Diary, type Weather } from '@diary/shared';
import { DiaryPage } from '../../components/DiaryPage.tsx';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { useMe } from '../../components/RequireAuth.tsx';
import { api, ApiError } from '../../lib/api-client.ts';
import { formatDiaryDay, formatJapaneseDate, initialDiaryDate, todayLocal } from '../../lib/dates.ts';
import {
  clearDraft,
  clearNewDraft,
  isEmptyDraft,
  listNewDraftDates,
  loadDraft,
  loadNewDraft,
  migrateLegacyNewDraft,
  saveDraft,
  saveNewDraft,
} from '../../lib/draft-store.ts';
import { UserFacingError } from '../../lib/errors.ts';
import { ruledHeight } from '../../lib/ruled-lines.ts';
import { WEATHER_LABELS } from '../../lib/weather.ts';

const DRAFT_DELAY_MS = 500;

/** 新しく書く記入画面。URL が変わるたびに作り直し、URL の日付で開き直す(003 research §5) */
export function NewDiaryEditor() {
  const location = useLocation();
  return <DiaryEditor key={location.key} />;
}

export function DiaryEditor() {
  const me = useMe();
  const navigate = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const editing = params.date !== undefined;
  const slot = params.date ?? 'new';
  const today = todayLocal();

  // 開く日付は URL だけで決め、書きかけの日付で置き換えない(003 FR-001、FR-002)
  const [initialDate] = useState(() => params.date ?? initialDiaryDate(search.get('date'), today));
  const [date, setDate] = useState(initialDate);
  const [body, setBody] = useState('');
  const [weather, setWeather] = useState<Weather | ''>('');
  const [image, setImage] = useState<Blob | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  // 新規の書きかけがある日付(003 FR-006)。表示では画面の日付を除く
  const [draftDates, setDraftDates] = useState<string[]>([]);
  const otherDraftDates = draftDates.filter((d) => d !== date);

  // 下書き、または編集する絵日記を読み込む。新規では開いた日付の書きかけだけを戻す(003 FR-003)
  useEffect(() => {
    const state = { active: true };
    (async () => {
      if (!editing) await migrateLegacyNewDraft(me.handle);
      const draft = editing ? await loadDraft(me.handle, slot) : await loadNewDraft(me.handle, initialDate);
      if (!editing) {
        const dates = await listNewDraftDates(me.handle);
        if (state.active) setDraftDates(dates);
      }
      if (editing) {
        const diary = await api<Diary>(`/users/${me.handle}/diaries/${slot}`);
        if (!state.active) return;
        setExistingImageUrl(diary.imageUrl);
        setBody(diary.body);
        setWeather(diary.weather);
      }
      if (draft && state.active) {
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
  }, [me.handle, slot, editing, initialDate]);

  // 入力の500ms後に下書きを保存する
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      const draft = { date, body, weather, image };
      (editing
        ? saveDraft(me.handle, slot, draft)
        : saveNewDraft(me.handle, draft).then(async () => {
            setDraftDates(await listNewDraftDates(me.handle));
          })
      ).catch((e: unknown) => {
        setError(e);
      });
    }, DRAFT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [loaded, editing, me.handle, slot, date, body, weather, image]);

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

  // 日付を変えたら、書きかけを変更後の日付へ移す。変更後の日付の書きかけを置き換える前に確かめる(003 FR-005)
  const changeDate = async (next: string) => {
    if (editing) return;
    const existing = await loadNewDraft(me.handle, next);
    if (existing && !isEmptyDraft(existing)) {
      if (!window.confirm(`${formatJapaneseDate(next)}の書きかけを、いま書いている内容で置き換えますか?`)) return;
    }
    const previous = date;
    setDate(next);
    await clearNewDraft(me.handle, previous);
    setDraftDates(await listNewDraftDates(me.handle));
  };

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
      await (editing ? clearDraft(me.handle, slot) : clearNewDraft(me.handle, date));
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
      {!editing && otherDraftDates.length > 0 && (
        <nav aria-label="書きかけの絵日記" className="draft-notice">
          <p>書きかけの絵日記があります</p>
          <ul>
            {otherDraftDates.map((d) => (
              <li key={d}>
                <Link to={`/diaries/new?date=${d}`}>{formatJapaneseDate(d)}</Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
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
                changeDate(e.target.value).catch((err: unknown) => {
                  setError(err);
                });
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
