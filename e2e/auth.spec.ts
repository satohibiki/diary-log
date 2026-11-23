// 004: ID とパスワードが標準のログイン。パスワードでの登録とログインは仮想認証器が不要なため、全ブラウザで実行する。
// パスキーでの登録を前提にしたテストは、仕様の変更(004 FR-001)により書き換えた
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addVirtualAuthenticator, fetchOtp, uniqueHandle, waitForMail } from './helpers/auth.ts';
import { resetRateLimits } from './helpers/seed-session.ts';

const PASSWORD = 'correct horse battery staple';

test.beforeEach(async () => {
  await resetRateLimits();
});

async function signUp(page: Page, handle: string, email: string) {
  await page.goto('/signup');
  await page.getByLabel('ID').fill(handle);
  await page.getByLabel('メールアドレス').fill(email);
  const sentAt = new Date();
  await page.getByRole('button', { name: '確認メールを送る' }).click();
  await page.getByLabel('ワンタイムパスワード').fill(await fetchOtp(email, sentAt));
  await page.getByRole('button', { name: 'メールアドレスを確認' }).click();
  await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
  await page.getByLabel('パスワード(確認)').fill(PASSWORD);
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByText(/パスキーを追加すると/)).toBeVisible();
}

async function logOut(page: Page) {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function logIn(page: Page, handle: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('ID').fill(handle);
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
}

async function newDevice(browser: Browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  return { context, page: await context.newPage() };
}

test('(a) registers with a password, logs out, and logs in again without a one-time password', async ({ page }) => {
  const handle = uniqueHandle('pw');
  await signUp(page, handle, `${handle}@example.com`);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await logOut(page);
  await logIn(page, handle);
  await expect(page.getByRole('navigation', { name: 'メイン' })).toBeVisible();
});

test('(b) asks a new device for a one-time password and tells the owner', async ({ page, browser }) => {
  const handle = uniqueHandle('dev');
  const email = `${handle}@example.com`;
  await signUp(page, handle, email);

  const other = await newDevice(browser);
  const sentAt = new Date();
  await logIn(other.page, handle);
  await expect(other.page.getByText(/初めて使う端末です/)).toBeVisible();
  await other.page.getByLabel('ワンタイムパスワード').fill(await fetchOtp(email, sentAt));
  await other.page.getByRole('button', { name: '確認する' }).click();
  await expect(other.page.getByRole('navigation', { name: 'メイン' })).toBeVisible();
  await waitForMail(email, '【diary-log】新しい端末からログインしました', sentAt);
  await other.context.close();
});

test('(c) gives the same message for an unknown ID and a wrong password', async ({ page }) => {
  const handle = uniqueHandle('err');
  await signUp(page, handle, `${handle}@example.com`);
  await logOut(page);
  await logIn(page, `${handle}x`.slice(0, 20));
  const unknown = await page.getByRole('alert').textContent();
  await logIn(page, handle, 'wrong horse battery staple');
  await expect(page.getByRole('alert')).toHaveText(unknown ?? '');
  expect(unknown).toBe('ID またはパスワードが正しくありません');
});

// US2: パスワードで本人確認をしてパスキーを追加し、パスキーでログインする。仮想認証器は Chromium のみ
test('(d) adds a passkey after a password check and logs in with it', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium の仮想認証器が必要');
  await addVirtualAuthenticator(context, page);
  const handle = uniqueHandle('pk');
  await signUp(page, handle, `${handle}@example.com`);
  await page.goto('/settings/security');
  await page.getByLabel('新しいパスキーの名前').fill('このパソコン');
  await page.getByRole('button', { name: 'パスキーを追加' }).click();
  const dialog = page.getByRole('dialog', { name: '本人確認' });
  await dialog.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: '確認する' }).click();
  await expect(page.getByText(/パスキーを追加しました/)).toBeVisible();
  await expect(page.getByText('このパソコン')).toBeVisible();

  await logOut(page);
  await page.getByLabel('ID').fill(handle);
  await page.getByRole('button', { name: 'パスキーでログイン' }).click();
  await expect(page.getByRole('navigation', { name: 'メイン' })).toBeVisible();
});

// US3: 別の端末で OTP によって復旧し、新しいパスワードを設定する。元の端末はログアウトされる(全ブラウザ)
test('(e) recovers on another device with a new password and signs the old device out', async ({ page, browser }) => {
  const handle = uniqueHandle('rec');
  const email = `${handle}@example.com`;
  await signUp(page, handle, email);

  const other = await newDevice(browser);
  await other.page.goto('/recover');
  await other.page.getByLabel('ID').fill(handle);
  const sentAt = new Date();
  await other.page.getByRole('button', { name: '復旧用のメールを送る' }).click();
  await other.page.getByLabel('ワンタイムパスワード').fill(await fetchOtp(email, sentAt));
  await other.page.getByRole('button', { name: '確認する' }).click();
  const newPassword = 'a brand new passphrase 2026';
  await other.page.getByLabel('新しいパスワード', { exact: true }).fill(newPassword);
  await other.page.getByLabel('新しいパスワード(確認)').fill(newPassword);
  await other.page.getByRole('button', { name: '新しいパスワードを設定' }).click();
  await expect(other.page.getByRole('navigation', { name: 'メイン' })).toBeVisible();

  // 復旧すると、元の端末のセッションは失効する
  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/login$/);
  // 復旧した端末は確認済みのため、新しいパスワードだけでログインできる
  await logOut(other.page);
  await logIn(other.page, handle, newPassword);
  await expect(other.page.getByRole('navigation', { name: 'メイン' })).toBeVisible();
  await other.context.close();
});
