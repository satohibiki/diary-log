import { expect, test } from '@playwright/test';
import { addVirtualAuthenticator, fetchOtp, uniqueHandle } from './helpers/auth.ts';
import { resetRateLimits } from './helpers/seed-session.ts';

// パスキーの仮想認証器は Chromium のみで利用できる。Firefox と Safari は手動で確認する(quickstart.md)
test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium の仮想認証器が必要');

test.beforeEach(async () => {
  await resetRateLimits();
});

test('registers, logs out, and logs in with a passkey', async ({ page, context }) => {
  await addVirtualAuthenticator(context, page);
  const handle = uniqueHandle('e2e');
  const email = `${handle}@example.com`;
  const startedAt = new Date();

  await page.goto('/signup');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel('ID').fill(handle);
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByRole('button', { name: '確認メールを送る' }).click();
  await page.getByLabel('ワンタイムパスワード').fill(await fetchOtp(email, startedAt));
  await page.getByRole('button', { name: 'パスキーを作成して登録' }).click();
  await expect(page.getByRole('navigation', { name: 'メイン' })).toBeVisible();

  await page.goto('/profile');
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('ID').fill(handle);
  await page.getByRole('button', { name: 'パスキーでログイン' }).click();
  await expect(page.getByRole('navigation', { name: 'メイン' })).toBeVisible();
});

test('recovers the account with a one-time password on another device', async ({ page, context, browser }) => {
  await addVirtualAuthenticator(context, page);
  const handle = uniqueHandle('rec');
  const email = `${handle}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('ID').fill(handle);
  await page.getByLabel('メールアドレス').fill(email);
  const signupAt = new Date();
  await page.getByRole('button', { name: '確認メールを送る' }).click();
  await page.getByLabel('ワンタイムパスワード').fill(await fetchOtp(email, signupAt));
  await page.getByRole('button', { name: 'パスキーを作成して登録' }).click();
  await expect(page.getByRole('navigation', { name: 'メイン' })).toBeVisible();

  // 別の端末(パスキーを持たない新しいブラウザ)で復旧する
  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  const otherPage = await other.newPage();
  await addVirtualAuthenticator(other, otherPage);
  await otherPage.goto('/recover');
  await otherPage.getByLabel('ID').fill(handle);
  const recoverAt = new Date();
  await otherPage.getByRole('button', { name: '復旧用のメールを送る' }).click();
  await otherPage.getByLabel('ワンタイムパスワード').fill(await fetchOtp(email, recoverAt));
  await otherPage.getByRole('button', { name: '新しいパスキーを登録' }).click();
  await expect(otherPage.getByRole('navigation', { name: 'メイン' })).toBeVisible();

  // 復旧すると、元の端末のセッションは失効する
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await other.close();
});
