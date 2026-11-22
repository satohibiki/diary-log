import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiaryPage } from '../src/components/DiaryPage.tsx';

describe('DiaryPage', () => {
  it('lays out the picture, the date and weather row, and the ruled body from top to bottom', () => {
    const { container } = render(
      <DiaryPage
        heading={<h2>2026年</h2>}
        picture={<span>え</span>}
        day={<span>11月 8日(日)</span>}
        weather={<span>はれ</span>}
        body={<span>ほんぶん</span>}
      />,
    );
    const page = container.querySelector('article.diary-page');
    expect(page).not.toBeNull();
    const sections = [...(page?.querySelectorAll('.diary-page__picture, .diary-page__meta, .diary-page__body') ?? [])];
    expect(sections.map((el) => el.className)).toEqual(['diary-page__picture', 'diary-page__meta', 'diary-page__body']);

    const meta = page?.querySelector('.diary-page__meta');
    const children = [...(meta?.children ?? [])].map((el) => el.className);
    expect(children).toEqual(['diary-page__day', 'diary-page__weather']);

    expect(page?.querySelector('.diary-page__picture')?.textContent).toBe('え');
    expect(page?.querySelector('.diary-page__day')?.textContent).toBe('11月 8日(日)');
    expect(page?.querySelector('.diary-page__weather')?.textContent).toBe('はれ');
    expect(page?.querySelector('.diary-page__body')?.textContent).toBe('ほんぶん');
    // 年などの見出しはページ(枠)の外に置く
    expect(page?.querySelector('.diary-page__sheet')?.textContent).not.toContain('2026年');
    expect(page?.textContent).toContain('2026年');
  });
});
