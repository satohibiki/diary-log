import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom は styles.css を読み込まないため、文章欄の高さの計算に使う行の高さだけを与える
const style = document.createElement('style');
style.textContent = '.ruled-text { line-height: 32px; }';
document.head.appendChild(style);

afterEach(() => {
  cleanup();
});
