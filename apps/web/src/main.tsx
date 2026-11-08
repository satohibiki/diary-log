import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
// 手書き風の書体 Klee One を自サービスから配信する(ADR-0006)
import '@fontsource/klee-one/400.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root がありません');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
