import { expect, test } from '@playwright/test';
import { seedUser, signInAs } from './helpers/seed-session.ts';
import { uniqueHandle } from './helpers/auth.ts';

// 全ブラウザと幅360pxで実行する。ログインには seed-session.ts を使う(仮想認証器が不要)
test.beforeEach(async ({ context }) => {
  await signInAs(context, await seedUser(uniqueHandle('vrt')));
});

test('writes vertically without horizontal scrolling', async ({ page }) => {
  await page.goto('/diaries/new');
  const body = page.getByLabel('文章');
  await expect(body).toHaveCSS('writing-mode', 'vertical-rl');
  await body.fill('あ'.repeat(400));
  await expect(page.getByText('残り 0 文字')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('shows the saved text vertically', async ({ page }) => {
  await page.goto('/diaries/new');
  await page.getByLabel('絵(画像)').setInputFiles('e2e/fixtures/photo-with-gps.jpg');
  await page.getByLabel('雪').check();
  await page.getByLabel('文章').fill('ゆきが ふりました');
  await page.getByRole('button', { name: '保存する' }).click();
  const text = page.getByText('ゆきが ふりました');
  await expect(text).toBeVisible();
  await expect(text).toHaveCSS('writing-mode', 'vertical-rl');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
