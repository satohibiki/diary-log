import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { seedDiary, seedUser, signInAs } from './helpers/seed-session.ts';
import { uniqueHandle } from './helpers/auth.ts';

const PUBLIC_PAGES = ['/login', '/signup', '/recover', '/privacy'];
const PRIVATE_PAGES = ['/calendar', '/diaries/new', '/feed', '/connections', '/profile', '/settings/security'];

async function expectNoSeriousViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

for (const path of PUBLIC_PAGES) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expectNoSeriousViolations(page);
  });
}

test('the diary page has no serious accessibility violations, including color contrast', async ({ page, context }) => {
  const owner = await seedUser(uniqueHandle('a11yv'));
  await seedDiary(owner, '2026-10-03', { body: 'こんとらすとを たしかめる にっき', weather: 'rainy' });
  await signInAs(context, owner);
  await page.goto(`/users/${owner.handle}/diaries/2026-10-03`);
  await expect(page.getByLabel('文章')).toBeVisible();
  await expectNoSeriousViolations(page);
});

test.describe('signed-in pages', () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, await seedUser(uniqueHandle('a11y')));
  });

  for (const path of PRIVATE_PAGES) {
    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  }

  test('writes a diary using only the keyboard', async ({ page, browserName }) => {
    // macOS の WebKit は Safari の既定どおり、Option+Tab でボタンやラジオボタンへ移動する
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.goto('/diaries/new');
    await page.getByLabel('日付').focus();
    // 日付欄は年・月・日の区画ごとに Tab で移動するブラウザがあるため、天気に届くまで Tab で進む
    const sunny = page.getByLabel('晴れ');
    for (let i = 0; i < 6 && !(await sunny.evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press(tab);
    }
    await expect(sunny).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('晴れ')).toBeChecked();
    await page.getByLabel('絵(画像)').setInputFiles('e2e/fixtures/photo-with-gps.jpg');
    await page.getByLabel('文章').focus();
    await page.keyboard.type('きーぼーどだけで かきました');
    await page.keyboard.press(tab);
    await expect(page.getByRole('button', { name: '保存する' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('きーぼーどだけで かきました')).toBeVisible();
  });
});

// 004: パスワードでのログインをキーボードだけで行える。表示の切り替えボタンも操作できる。
// 初めて使う端末の確認の画面と、本人確認のダイアログにも重大な違反がない
test('logs in with a password using only the keyboard, and the device check page is accessible', async ({ page, browserName }) => {
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  const password = 'correct horse battery staple';
  const user = await seedUser(uniqueHandle('a11yp'), 'private', password);
  await page.goto('/login');
  await page.getByLabel('ID').focus();
  await page.keyboard.type(user.handle);
  await page.keyboard.press(tab);
  await expect(page.getByLabel('パスワード', { exact: true })).toBeFocused();
  await page.keyboard.type(password);
  await page.keyboard.press(tab);
  await expect(page.getByRole('button', { name: 'パスワードを表示' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('パスワード', { exact: true })).toHaveAttribute('type', 'text');
  await page.keyboard.press(tab);
  await expect(page.getByRole('button', { name: 'ログイン', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('ワンタイムパスワード')).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('the re-authentication dialog has no serious accessibility violations', async ({ page, context }) => {
  await signInAs(context, await seedUser(uniqueHandle('a11yd'), 'private', 'correct horse battery staple'));
  await page.goto('/settings/security');
  await page.getByRole('button', { name: 'パスキーを追加' }).click();
  await expect(page.getByRole('dialog', { name: '本人確認' })).toBeVisible();
  await expectNoSeriousViolations(page);
});
