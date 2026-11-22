import { expect, test } from '@playwright/test';
import { seedDiary, seedFollow, seedUser, signInAs } from './helpers/seed-session.ts';
import { uniqueHandle } from './helpers/auth.ts';

test.skip(({ browserName }) => browserName !== 'chromium', '性能の測定は1つのブラウザで行う');

/** 本番用にビルドした画面(playwright.config.ts の2つ目の webServer) */
const PRODUCTION_PREVIEW = 'https://localhost:4173';

async function writeDiary(page: import('@playwright/test').Page, date: string, body: string) {
  await page.goto(`/diaries/new?date=${date}`);
  await page.getByLabel('絵(画像)').setInputFiles('e2e/fixtures/photo-with-gps.jpg');
  await page.getByLabel('晴れ').check();
  await page.getByLabel('文章').fill(body);
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText(body)).toBeVisible();
}

test('SC-003: opens a diary from about a year ago within 10 seconds', async ({ page, context }) => {
  await signInAs(context, await seedUser(uniqueHandle('sc3')));
  const past = new Date();
  past.setMonth(past.getMonth() - 11, 10);
  const date = `${String(past.getFullYear())}-${String(past.getMonth() + 1).padStart(2, '0')}-10`;
  await writeDiary(page, date, 'いちねんまえの にっき');

  await page.goto('/calendar');
  const started = Date.now();
  for (let i = 0; i < 11; i += 1) await page.getByRole('button', { name: '前の月' }).click();
  await page.getByRole('link', { name: `${String(past.getMonth() + 1)}月10日 絵日記あり` }).click();
  await expect(page.getByText('いちねんまえの にっき')).toBeVisible();
  expect(Date.now() - started).toBeLessThan(10_000);
});

test('SC-005 and SC-008: feed loads within 2 seconds, and turning private hides diaries within 5 seconds', async ({
  page,
  context,
  browser,
}) => {
  const owner = await seedUser(uniqueHandle('sc5o'), 'public');
  const reader = await seedUser(uniqueHandle('sc5r'));
  await seedFollow(reader, owner);
  await signInAs(context, owner);
  for (let i = 1; i <= 20; i += 1) await writeDiary(page, `2026-10-${String(i).padStart(2, '0')}`, `にっき${String(i)}ばんめ`);

  const readerContext = await browser.newContext({ ignoreHTTPSErrors: true });
  await signInAs(readerContext, reader);
  const durations: number[] = [];
  for (let i = 0; i < 20; i += 1) {
    const started = Date.now();
    const res = await readerContext.request.get('/api/v1/feed', { headers: { origin: 'https://localhost:5173' } });
    expect(res.status()).toBe(200);
    durations.push(Date.now() - started);
  }
  durations.sort((a, b) => a - b);
  expect(durations[Math.floor(durations.length * 0.95) - 1]).toBeLessThan(2000);

  const res = await page.request.patch('/api/v1/me', {
    headers: { origin: 'https://localhost:5173' },
    data: { visibility: 'private' },
  });
  expect(res.status()).toBe(200);
  const switchedAt = Date.now();
  await expect
    .poll(async () => {
      const feed = await readerContext.request.get('/api/v1/feed');
      return ((await feed.json()) as { items: unknown[] }).items.length;
    })
    .toBe(0);
  expect(Date.now() - switchedAt).toBeLessThan(5000);
  await readerContext.close();
});

test('SC-004 (002): shows a diary in the handwriting font within 2 seconds on a 10Mbps, 40ms line', async ({ browser }) => {
  const owner = await seedUser(uniqueHandle('sc4'));
  await seedDiary(owner, '2026-10-05', { body: 'きょうは こうえんで ともだちと あそびました。たのしかったです。', weather: 'sunny' });
  // 書体のキャッシュがない、新しいコンテキストで測る
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await signInAs(context, owner);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 40,
    downloadThroughput: (10 * 1024 * 1024) / 8,
    uploadThroughput: (5 * 1024 * 1024) / 8,
  });
  const started = Date.now();
  // 開発用サーバーはモジュールをまとめずに配信するため、本番用にビルドした画面で測る
  await page.goto(`${PRODUCTION_PREVIEW}/users/${owner.handle}/diaries/2026-10-05`);
  const body = page.getByLabel('文章');
  await expect(body).toBeVisible();
  const text = (await body.textContent()) ?? '';
  await expect
    .poll(
      () =>
        page.evaluate(
          (t) =>
            // check() は書体が宣言されていないときも真を返すため、Klee One が実際に読み込まれたことも確かめる
            document.fonts.status === 'loaded' &&
            document.fonts.check('16px "Klee One"', t) &&
            [...document.fonts].some((f) => f.family.replaceAll('"', '') === 'Klee One' && f.status === 'loaded'),
          text,
        ),
      {
      timeout: 5000,
      intervals: [50],
    })
    .toBe(true);
  expect(Date.now() - started).toBeLessThan(2000);
  await context.close();
});
