import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          include: ['packages/shared/tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'server-unit',
          include: ['apps/server/tests/unit/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['apps/server/tests/helpers/env.ts'],
        },
      },
      {
        test: {
          name: 'server-integration',
          include: ['apps/server/tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['apps/server/tests/helpers/env.ts'],
          globalSetup: ['apps/server/tests/helpers/global-setup.ts'],
          // 全テストが同じ DB を使うため、ファイル単位でも直列に実行する
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          include: ['apps/web/tests/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['apps/web/tests/setup.ts'],
        },
      },
    ],
  },
});
