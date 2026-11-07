import { expect, test } from '@playwright/test';
import { seedUser, signInAs } from './helpers/seed-session.ts';
import { uniqueHandle } from './helpers/auth.ts';

test('opens a past diary from the calendar', async ({ page, context }) => {
  await signInAs(context, await seedUser(uniqueHandle('cal')));
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const date = `${String(prev.getFullYear())}-${String(prev.getMonth() + 1).padStart(2, '0')}-15`;

  await page.goto(`/diaries/new?date=${date}`);
  await page.getByLabel('絵(画像)').setInputFiles('e2e/fixtures/photo-with-gps.jpg');
  await page.getByLabel('晴れ').check();
  await page.getByLabel('文章').fill('せんげつの にっき');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText('せんげつの にっき')).toBeVisible();

  await page.goto('/calendar');
  await page.getByRole('button', { name: '前の月' }).click();
  await page.getByRole('link', { name: `${String(prev.getMonth() + 1)}月15日 絵日記あり` }).click();
  await expect(page.getByText('せんげつの にっき')).toBeVisible();
});
