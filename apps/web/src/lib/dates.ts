/** 利用者の端末の現地日付(YYYY-MM-DD) */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear().toString().padStart(4, '0');
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 2026-11-07 → 2026年11月7日(土) */
export function formatJapaneseDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][value.getUTCDay()] ?? '';
  return `${String(y)}年${String(m)}月${String(d)}日(${weekday})`;
}
