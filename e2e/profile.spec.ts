import { expect, test } from '@playwright/test';
import { seedFollow, seedUser, signInAs } from './helpers/seed-session.ts';
import { uniqueHandle } from './helpers/auth.ts';

test('switching visibility changes what an approved follower can see', async ({ page, context, browser }) => {
  // フォロー関係はテストデータで用意する(US4 は US5 に依存しない)
  const owner = await seedUser(uniqueHandle('own'));
  const follower = await seedUser(uniqueHandle('flw'));
  await seedFollow(follower, owner);
  await signInAs(context, owner);

  await page.goto('/diaries/new');
  await page.getByLabel('絵(画像)').setInputFiles('e2e/fixtures/photo-with-gps.jpg');
  await page.getByLabel('晴れ').check();
  await page.getByLabel('文章').fill('こうかいする にっき');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText('こうかいする にっき')).toBeVisible();
  await expect(page).toHaveURL(/\/users\/[^/]+\/diaries\/\d{4}-\d{2}-\d{2}$/);
  const diaryUrl = new URL(page.url()).pathname;

  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  await signInAs(other, follower);
  const otherPage = await other.newPage();
  await otherPage.goto(diaryUrl);
  await expect(otherPage.getByRole('alert')).toContainText('見つかりません');

  await page.goto('/profile');
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('過去の絵日記');
    void dialog.accept();
  });
  await page.getByRole('radio', { name: /公開する/ }).click();
  await expect(page.getByRole('radio', { name: /公開する/ })).toBeChecked();
  await otherPage.reload();
  await expect(otherPage.getByText('こうかいする にっき')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('radio', { name: /公開しない/ }).click();
  await expect(page.getByRole('radio', { name: /公開しない/ })).toBeChecked();
  await otherPage.reload();
  await expect(otherPage.getByRole('alert')).toContainText('見つかりません');
  await other.close();
});

test('exports diaries and imports them into another account, skipping duplicates', async ({ page, context, browser }) => {
  const source = await seedUser(uniqueHandle('src'));
  await signInAs(context, source);
  await page.goto('/diaries/new?date=2026-11-01');
  await page.getByLabel('絵(画像)').setInputFiles('e2e/fixtures/photo-with-gps.jpg');
  await page.getByLabel('雨').check();
  await page.getByLabel('文章').fill('もちだす にっき');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText('もちだす にっき')).toBeVisible();

  await page.goto('/profile');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'すべての絵日記をエクスポート' }).click();
  const path = await (await download).path();

  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  await signInAs(other, await seedUser(uniqueHandle('dst')));
  const otherPage = await other.newPage();
  await otherPage.goto('/profile');
  await otherPage.getByLabel('エクスポートしたファイルからインポート').setInputFiles(path);
  await expect(otherPage.getByRole('status')).toContainText('取り込み: 1 件');
  await otherPage.getByLabel('エクスポートしたファイルからインポート').setInputFiles(path);
  await expect(otherPage.getByRole('status')).toContainText('スキップ(同じ日付があるため): 1 件');
  await other.close();
});
