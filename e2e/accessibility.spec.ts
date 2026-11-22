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
