import type { ReactNode } from 'react';

type Props = {
  /** ページ(枠)の外に置く見出し。年や書いた人など */
  heading?: ReactNode;
  picture: ReactNode;
  day: ReactNode;
  weather: ReactNode;
  body: ReactNode;
};

/**
 * 絵日記帳の1ページ。上から絵の枠、日付欄と天気欄の行、罫線の文章欄を並べる(002 FR-001)。
 * 構成だけを定め、各欄を入力にするか表示にするかは呼び出し側が決める。
 */
export function DiaryPage({ heading, picture, day, weather, body }: Props) {
  return (
    <article className="diary-page">
      {heading}
      <div className="diary-page__sheet">
        <figure className="diary-page__picture">{picture}</figure>
        <div className="diary-page__meta">
          <div className="diary-page__day">{day}</div>
          <div className="diary-page__weather">{weather}</div>
        </div>
        <div className="diary-page__body">{body}</div>
      </div>
    </article>
  );
}
