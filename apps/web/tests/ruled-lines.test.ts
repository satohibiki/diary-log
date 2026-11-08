import { describe, expect, it } from 'vitest';
import { MIN_RULED_LINES, ruledHeight } from '../src/lib/ruled-lines.ts';

describe('ruledHeight', () => {
  it('is at least eight ruled lines', () => {
    expect(MIN_RULED_LINES).toBe(8);
    expect(ruledHeight(0, 32)).toBe(256);
    expect(ruledHeight(256, 32)).toBe(256);
  });

  it('grows by whole ruled lines to fit the content', () => {
    expect(ruledHeight(257, 32)).toBe(288);
    expect(ruledHeight(600, 32)).toBe(608);
  });

  it('rejects a non-positive line gap instead of guessing', () => {
    expect(() => ruledHeight(100, 0)).toThrow();
    expect(() => ruledHeight(100, -1)).toThrow();
  });
});
