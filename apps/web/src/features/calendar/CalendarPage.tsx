import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { useMe } from '../../components/RequireAuth.tsx';
import { api } from '../../lib/api-client.ts';
import { todayLocal } from '../../lib/dates.ts';
import { useAction } from '../../lib/use-action.ts';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** 月のカレンダーを、日曜始まりの週ごとに並べる。前後の空白は null */
function weeksOf(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, 1));
  const days = new Date(Date.UTC(y ?? 0, m ?? 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export function CalendarPage() {
  const me = useMe();
  const today = todayLocal();
  const currentMonth = today.slice(0, 7);
  const [search, setSearch] = useSearchParams();
  const requested = search.get('month');
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) && requested <= currentMonth ? requested : currentMonth;
  const [dates, setDates] = useState<Set<string> | null>(null);

  const load = useAction(
    useCallback(async (target: string) => {
      setDates(null);
      const res = await api<{ dates: string[] }>(`/me/diaries?month=${target}`);
      setDates(new Set(res.dates));
    }, []),
  );
  const { run } = load;
  useEffect(() => {
    void run(month);
  }, [run, month]);

  const [y, m] = month.split('-').map(Number);
  const go = (delta: number) => {
    setSearch({ month: shiftMonth(month, delta) });
  };

  return (
    <section className="calendar" aria-labelledby="calendar-heading">
      <div className="calendar-nav">
        <button
          type="button"
          onClick={() => {
            go(-1);
          }}
        >
          前の月
        </button>
        <h1 id="calendar-heading">{`${String(y)}年${String(m)}月`}</h1>
        <button
          type="button"
          disabled={month >= currentMonth}
          onClick={() => {
            go(1);
          }}
        >
          次の月
        </button>
      </div>
      <ErrorMessage error={load.error} />
      {dates && (
        <table className="calendar-grid">
          <thead>
            <tr>
              {WEEKDAYS.map((w) => (
                <th key={w} scope="col">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeksOf(month).map((week) => (
              <tr key={week.find((d) => d !== null) ?? 'empty'}>
                {week.map((date, i) => (
                  <td key={date ?? `blank-${String(i)}`}>
                    {date && <DayCell date={date} today={today} has={dates.has(date)} handle={me.handle} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DayCell({ date, today, has, handle }: { date: string; today: string; has: boolean; handle: string }) {
  const [, mm, dd] = date.split('-').map(Number);
  const label = `${String(mm)}月${String(dd)}日`;
  if (has) {
    return (
      <Link className="day has-diary" to={`/users/${handle}/diaries/${date}`} aria-label={`${label} 絵日記あり`}>
        {dd}
      </Link>
    );
  }
  if (date > today) {
    return (
      <span className="day future" aria-label={label}>
        {dd}
      </span>
    );
  }
  return (
    <Link className="day" to={`/diaries/new?date=${date}`} aria-label={`${label} 絵日記を書く`}>
      {dd}
    </Link>
  );
}
