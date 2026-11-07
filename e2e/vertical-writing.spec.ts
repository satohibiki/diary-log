import { expect, test, type Page } from '@playwright/test';
import { seedUser, signInAs } from './helpers/seed-session.ts';
import { uniqueHandle } from './helpers/auth.ts';

// 全ブラウザと幅360pxで実行する。ログインには seed-session.ts を使う(仮想認証器が不要)

/** 画面の幅からはみ出している要素を返す。失敗したときに原因の要素が分かるようにする */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const pageOverflow = document.documentElement.scrollWidth - width;
    const found = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 0.5 && !el.closest('.manuscript'))
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} right=${el.getBoundingClientRect().right.toFixed(1)}`);
    return pageOverflow > 0 ? [`page overflow=${String(pageOverflow)}px`, ...found] : found;
  });
}

test.beforeEach(async ({ context }) => {
  await signInAs(context, await seedUser(uniqueHandle('vrt')));
});

test('writes vertically without horizontal scrolling', async ({ page }) => {
  await page.goto('/diaries/new');
  const body = page.getByLabel('文章');
  await expect(body).toHaveCSS('writing-mode', 'vertical-rl');
  await body.fill('あ'.repeat(400));
  await expect(page.getByText('残り 0 文字')).toBeVisible();
  // 400字(20字×20行)が原稿用紙のマスに収まり、文章欄の中でも横にスクロールしない
  const box = await body.evaluate((el) => ({ visible: el.clientWidth, content: el.scrollWidth }));
  expect(box.content).toBeLessThanOrEqual(box.visible);
  expect(await overflowingElements(page)).toEqual([]);
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
  expect(await overflowingElements(page)).toEqual([]);
});
