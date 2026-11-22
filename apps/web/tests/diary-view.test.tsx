import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Diary } from '@diary/shared';
import { DiaryCard } from '../src/features/diary/DiaryView.tsx';

const diary: Diary = {
  date: '2026-11-08',
  body: 'いちぎょうめ\n<b>にぎょうめ</b>',
  weather: 'sunny',
  imageUrl: '/api/v1/users/alice/diaries/2026-11-08/image?v=1',
  author: { handle: 'alice', nickname: 'ありす', hasAvatar: false },
};

describe('DiaryCard', () => {
  it('shows the diary as a diary page with the year outside and the day inside', () => {
    const { container } = render(<DiaryCard diary={diary} />);
    const page = container.querySelector('article.diary-page');
    expect(page).not.toBeNull();
    const sheet = page?.querySelector('.diary-page__sheet');
    expect(sheet?.textContent).not.toContain('2026年');
    expect(page?.textContent).toContain('2026年11月8日(日)');
    expect(page?.querySelector('.diary-page__day')?.textContent).toBe('11月 8日(日)');
    expect(page?.textContent).toContain('ありす');
  });

  it('shows the weather with a heading in the weather field and hides the icon from screen readers', () => {
    const { container } = render(<DiaryCard diary={diary} />);
    const weather = container.querySelector('.diary-page__weather');
    expect(weather?.textContent).toContain('天気');
    expect(weather?.textContent).toContain('晴れ');
    expect(weather?.querySelector('[aria-hidden="true"]')?.textContent).toBe('☀');
  });

  it('shows the body as plain text on ruled lines, keeping line breaks', () => {
    const { container } = render(<DiaryCard diary={diary} />);
    const body = screen.getByLabelText('文章');
    expect(body.tagName).toBe('P');
    expect(body.classList.contains('ruled-text')).toBe(true);
    expect(container.querySelector('.diary-page__body')?.contains(body)).toBe(true);
    expect(body.textContent).toBe('いちぎょうめ\n<b>にぎょうめ</b>');
    expect(body.querySelector('b')).toBeNull();
  });

  it('puts the picture in the picture frame with a descriptive alt text', () => {
    const { container } = render(<DiaryCard diary={diary} />);
    const img = screen.getByRole('img', { name: '2026年11月8日(日)の絵' });
    expect(container.querySelector('.diary-page__picture')?.contains(img)).toBe(true);
  });
});
