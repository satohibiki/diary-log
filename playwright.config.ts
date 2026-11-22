import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://localhost:5173',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    {
      name: 'mobile-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'https://localhost:5173',
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // 性能の測定(SC-004)用に、本番用にビルドした画面を配信する。API は開発用サーバーへ転送する
      command: 'npm run build -w @diary/web && npm exec -w @diary/web -- vite preview --port 4173 --strictPort',
      url: 'https://localhost:4173',
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
