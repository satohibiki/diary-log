// 罫線の文章欄の高さ。最初は8行で、文章が増えたら罫線1行単位で伸ばす(002 FR-009)
export const MIN_RULED_LINES = 8;

/** 内容の高さ(px)を収める、罫線の間隔の整数倍の高さを返す */
export function ruledHeight(contentHeight: number, gap: number): number {
  if (!(gap > 0)) throw new Error(`罫線の間隔が正しくありません: ${String(gap)}`);
  return Math.max(MIN_RULED_LINES, Math.ceil(contentHeight / gap)) * gap;
}
