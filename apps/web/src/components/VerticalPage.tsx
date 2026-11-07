import type { ReactNode } from 'react';

/** 原稿用紙風の枠に縦書きで文章を表示する。文章は文字としてのみ表示する */
export function VerticalPage({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="manuscript">
      <p className="vertical-text" aria-label={label}>
        {children}
      </p>
    </div>
  );
}
