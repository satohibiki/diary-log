import { expect, test } from '@playwright/test';
import { seedUser, signInAs } from './helpers/seed-session.ts';
import { uniqueHandle } from './helpers/auth.ts';

test('follow request, approval, feed, privacy, direct URL, and block', async ({ page, context, browser }) => {
  const owner = await seedUser(uniqueHandle('own'));
  const reader = await seedUser(uniqueHandle('rdr'));
  await signInAs(context, owner);

  // 絵日記を書き、公開する
  await page.goto('/diaries/new');
  await page.getByLabel('絵(画像)').setInputFiles('e2e/fixtures/photo-with-gps.jpg');
  await page.getByLabel('晴れ').check();
  await page.getByLabel('文章').fill('みんなに みせる にっき');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText('みんなに みせる にっき')).toBeVisible();
  await expect(page).toHaveURL(/\/users\/[^/]+\/diaries\/\d{4}-\d{2}-\d{2}$/);
  const diaryPath = new URL(page.url()).pathname;
  await page.goto('/profile');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('radio', { name: /公開する/ }).click();
  await expect(page.getByRole('radio', { name: /公開する/ })).toBeChecked();

  // 読者がフォローを申請する。承認前は読めない
  const readerContext = await browser.newContext({ ignoreHTTPSErrors: true });
  await signInAs(readerContext, reader);
  const r = await readerContext.newPage();
  await r.goto('/connections');
  await r.getByLabel('ID で検索').fill(owner.handle);
  await r.getByRole('button', { name: '検索' }).click();
  await r.getByRole('button', { name: 'フォローを申請' }).click();
  await expect(r.getByRole('status')).toContainText('申請しました');
  await r.goto('/feed');
  await expect(r.getByText(/まだ読める絵日記がありません/)).toBeVisible();

  // 承認すると一覧に表示される
  await page.goto('/connections');
  const requests = page.getByRole('region', { name: '承認待ちの申請' });
  await requests.getByRole('button', { name: '承認' }).click();
  await expect(page.getByRole('region', { name: 'フォロワー' }).getByText(`@${reader.handle}`, { exact: true })).toBeVisible();
  await r.goto('/feed');
  await expect(r.getByText('みんなに みせる にっき')).toBeVisible();

  // 非公開にすると、一覧からも直接の URL からも読めなくなる
  await page.goto('/profile');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('radio', { name: /公開しない/ }).click();
  await expect(page.getByRole('radio', { name: /公開しない/ })).toBeChecked();
  await r.goto('/feed');
  await expect(r.getByText('みんなに みせる にっき')).toHaveCount(0);
  await r.goto(diaryPath);
  await expect(r.getByRole('alert')).toContainText('見つかりません');

  // ブロックすると、再度の申請もできない
  await page.goto('/connections');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('region', { name: 'フォロワー' }).getByRole('button', { name: 'ブロック' }).click();
  await expect(page.getByRole('region', { name: 'ブロック中' }).getByText(`@${reader.handle}`, { exact: true })).toBeVisible();
  await r.goto('/connections');
  await r.getByLabel('ID で検索').fill(owner.handle);
  await r.getByRole('button', { name: '検索' }).click();
  await expect(r.getByRole('alert')).toContainText('見つかりません');
  await readerContext.close();
});
