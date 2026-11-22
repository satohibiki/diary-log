import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { seedUser, signInAs } from './helpers/seed-session.ts';
import { uniqueHandle } from './helpers/auth.ts';

const PHOTO = 'e2e/fixtures/photo-with-gps.jpg';

test.beforeEach(async ({ context }) => {
  await signInAs(context, await seedUser(uniqueHandle('dia')));
});

test('creates, views, edits, and deletes a picture diary', async ({ page }) => {
  await page.goto('/diaries/new');
  await page.getByLabel('絵(画像)').setInputFiles(PHOTO);
  await page.getByLabel('晴れ').check();
  await page.getByLabel('文章').fill('きょうは こうえんで あそびました。');
  await page.getByRole('button', { name: '保存する' }).click();

  await expect(page.getByText('きょうは こうえんで あそびました。')).toBeVisible();
  // 他の利用者が取得できる画像と同じ経路で取得し、位置情報が除去されていることを確認する
  const src = await page.getByRole('img', { name: /の絵$/ }).getAttribute('src');
  const image = await page.request.get(src ?? '');
  const meta = await sharp(Buffer.from(await image.body())).metadata();
  expect(meta.format).toBe('webp');
  expect(meta.exif).toBeUndefined();

  await page.getByRole('link', { name: '編集する' }).click();
  await expect(page.getByRole('heading', { name: '絵日記を編集' })).toBeVisible();
  // 既存の内容が読み込まれてから書き換える
  await expect(page.getByLabel('文章')).toHaveValue('きょうは こうえんで あそびました。');
  await page.getByLabel('文章').fill('かきなおしました。');
  await page.getByLabel('雨').check();
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText('かきなおしました。')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '削除する' }).click();
  await expect(page).toHaveURL(/\/calendar$/);
});

test('restores the draft after the tab is closed', async ({ page, context }) => {
  await page.goto('/diaries/new');
  await page.getByLabel('文章').fill('とちゅうまで かいた');
  await page.waitForTimeout(800);
  await page.close();
  const again = await context.newPage();
  await again.goto('/diaries/new');
  await expect(again.getByLabel('文章')).toHaveValue('とちゅうまで かいた');
});

// 003: 以前に開いた日の日付が「書く」に残らない
test('opens today on 書く even after the editor was opened on an earlier day', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 8, 9, 0));
  await page.goto('/diaries/new');
  await expect(page.locator('.diary-page__day')).toContainText('11月 8日(日)');
  await page.waitForTimeout(800);
  await page.close();

  const later = await context.newPage();
  await later.clock.setFixedTime(new Date(2026, 10, 22, 9, 0));
  await later.goto('/diaries/new');
  await expect(later.locator('.diary-page__day')).toContainText('11月 22日(日)');
});

test('does not carry a draft of an earlier day into today', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 8, 9, 0));
  await page.goto('/diaries/new');
  await page.getByLabel('文章').fill('8かのぶん');
  await page.waitForTimeout(800);
  await page.close();

  const later = await context.newPage();
  await later.clock.setFixedTime(new Date(2026, 10, 22, 9, 0));
  await later.goto('/diaries/new');
  await expect(later.locator('.diary-page__day')).toContainText('11月 22日(日)');
  await expect(later.getByLabel('文章')).toHaveValue('');
});

test('guides to a draft of an earlier day from 書く', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 8, 9, 0));
  await page.goto('/diaries/new');
  await page.getByLabel('文章').fill('8かのぶん');
  await page.waitForTimeout(800);
  await page.close();

  const later = await context.newPage();
  await later.setViewportSize({ width: 360, height: 740 });
  await later.clock.setFixedTime(new Date(2026, 10, 22, 9, 0));
  await later.goto('/diaries/new');
  const notice = later.getByRole('navigation', { name: '書きかけの絵日記' });
  await expect(notice).toContainText('書きかけの絵日記があります');
  expect(await later.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await notice.getByRole('link', { name: '2026年11月8日(日)' }).click();
  await expect(later.locator('.diary-page__day')).toContainText('11月 8日(日)');
  await expect(later.getByLabel('文章')).toHaveValue('8かのぶん');
});

test('guides to editing when a diary already exists for the date', async ({ page }) => {
  for (let i = 0; i < 2; i += 1) {
    await page.goto('/diaries/new');
    await page.getByLabel('絵(画像)').setInputFiles(PHOTO);
    await page.getByLabel('くもり').check();
    await page.getByLabel('文章').fill(`${String(i)}かいめ`);
    await page.getByRole('button', { name: '保存する' }).click();
    if (i === 0) await expect(page.getByText('0かいめ')).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'その日の絵日記を編集する' })).toBeVisible();
});
