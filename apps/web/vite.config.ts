import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 開発時は mkcert の証明書で HTTPS を提供し、/api を API サーバーへ転送する(research.md §18)
export default defineConfig(({ command }) => ({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
  server:
    command === 'serve'
      ? {
          port: 5173,
          strictPort: true,
          https: {
            cert: readFileSync(new URL('../../.certs/localhost.pem', import.meta.url)),
            key: readFileSync(new URL('../../.certs/localhost-key.pem', import.meta.url)),
          },
          proxy: { '/api': { target: 'http://localhost:3000' } },
        }
      : undefined,
}));
