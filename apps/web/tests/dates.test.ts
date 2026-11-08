import { describe, expect, it } from 'vitest';
import { formatDiaryDay, formatJapaneseDate } from '../src/lib/dates.ts';

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
