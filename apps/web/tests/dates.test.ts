import { describe, expect, it } from 'vitest';
import { formatDiaryDay, formatJapaneseDate, initialDiaryDate } from '../src/lib/dates.ts';

describe('formatDiaryDay', () => {
  it('formats month, day, and weekday without the year or zero padding', () => {
    expect(formatDiaryDay('2026-11-08')).toBe('11月 8日(日)');
    expect(formatDiaryDay('2026-01-05')).toBe('1月 5日(月)');
  });

  it('handles a leap day', () => {
    expect(formatDiaryDay('2028-02-29')).toBe('2月 29日(火)');
  });
});

describe('formatJapaneseDate', () => {
  it('keeps the full date with the year', () => {
    expect(formatJapaneseDate('2026-11-07')).toBe('2026年11月7日(土)');
  });
});

describe('initialDiaryDate', () => {
  const today = '2026-11-22';

  it('uses today without a date in the URL', () => {
    expect(initialDiaryDate(null, today)).toBe(today);
  });

  it('uses the given date when it is today or earlier', () => {
    expect(initialDiaryDate('2026-11-15', today)).toBe('2026-11-15');
    expect(initialDiaryDate('2026-11-22', today)).toBe('2026-11-22');
  });

  it('uses today for a future date', () => {
    expect(initialDiaryDate('2026-11-23', today)).toBe(today);
  });

  it('uses today for an invalid date', () => {
    for (const value of ['2026-1-5', 'abc', '', '2026-02-30']) {
      expect(initialDiaryDate(value, today)).toBe(today);
    }
  });
});
