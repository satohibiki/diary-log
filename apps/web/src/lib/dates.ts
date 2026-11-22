import { diaryDateSchema } from '@diary/shared';

/** 利用者の端末の現地日付(YYYY-MM-DD) */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear().toString().padStart(4, '0');
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 新しく書く記入画面を開く日付(003 FR-001、FR-002)。
 * URL の日付が正しく今日以前ならその日付、それ以外(なし、不正、未来)は今日にする
 */
export function initialDiaryDate(param: string | null, today: string): string {
  if (param !== null && diaryDateSchema.safeParse(param).success && param <= today) return param;
  return today;
}

/** YYYY-MM-DD を年、月、日、曜日に分ける。曜日の計算はここだけで行う */
function dateParts(date: string): { year: number; month: number; day: number; weekday: string } {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][value.getUTCDay()] ?? '';
  return { year, month, day, weekday };
}

/** 2026-11-07 → 2026年11月7日(土) */
export function formatJapaneseDate(date: string): string {
  const { year, month, day, weekday } = dateParts(date);
  return `${String(year)}年${String(month)}月${String(day)}日(${weekday})`;
}

/** 絵日記のページの日付欄: 2026-11-08 → 11月 8日(日) */
export function formatDiaryDay(date: string): string {
  const { month, day, weekday } = dateParts(date);
  return `${String(month)}月 ${String(day)}日(${weekday})`;
}
