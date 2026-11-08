import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// 開発時は mkcert の証明書で HTTPS を提供し、/api を API サーバーへ転送する(research.md §18)。
// .env の APP_ORIGIN が localhost 以外(例: https://MacBook-Pro-5.local:5173)のときだけ、
// 同じネットワークの別の端末から接続できるよう全てのネットワークで待ち受ける
export default defineConfig(({ command, mode }) => {
  if (command !== 'serve') return { plugins: [react()], build: { outDir: 'dist', sourcemap: false } };
  const { APP_ORIGIN } = loadEnv(mode, new URL('../..', import.meta.url).pathname, '');
  if (!APP_ORIGIN) throw new Error('.env に APP_ORIGIN を設定してください');
  const { hostname } = new URL(APP_ORIGIN);
  const lan = hostname !== 'localhost';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      host: lan ? true : 'localhost',
      allowedHosts: lan ? [hostname] : [],
      https: {
        cert: readFileSync(new URL('../../.certs/localhost.pem', import.meta.url)),
        key: readFileSync(new URL('../../.certs/localhost-key.pem', import.meta.url)),
      },
      proxy: { '/api': { target: 'http://localhost:3000' } },
    },
  };
});
