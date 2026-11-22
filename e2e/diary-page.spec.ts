// 002-handwritten-diary-ui: 絵日記帳のページ(絵の枠、日付と天気の行、横書きの罫線の文章欄)
import { expect, test, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { seedDiary, seedFollow, seedUser, signInAs, type SeededUser } from './helpers/seed-session.ts';
import { uniqueHandle } from './helpers/auth.ts';

/** 文章欄の罫線の間隔(--rule-gap)を px で返す */
async function ruleGap(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const probe = document.createElement('div');
    probe.style.height = 'var(--rule-gap)';
    el.parentElement?.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
}

/** 区画の上端の位置を、上から順に返す */
async function sectionTops(page: Page): Promise<number[]> {
  await expect(page.locator('.diary-page__body')).toBeVisible();
  return page.evaluate(() =>
    ['.diary-page__picture', '.diary-page__meta', '.diary-page__body'].map(
      (selector) => document.querySelector(selector)?.getBoundingClientRect().top ?? Number.NaN,
    ),
  );
}

async function image(width: number, height: number): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: '#88aacc' } }).png().toBuffer();
  return { name: `${String(width)}x${String(height)}.png`, mimeType: 'image/png', buffer };
}

const PHOTO = 'e2e/fixtures/photo-with-gps.jpg';

/** CSS の長さ(var(--rule-offset) など)を、要素の位置で px に直す */
async function cssLength(locator: Locator, value: string): Promise<number> {
  return locator.evaluate((el, v) => {
    const probe = document.createElement('div');
    probe.style.height = v;
    el.parentElement?.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  }, value);
}

/** 記入画面で絵日記を書いて保存し、表示画面へ移る */
async function writeDiary(page: Page, text: string): Promise<void> {
  await page.goto('/diaries/new');
  await page.getByLabel('絵(画像)').setInputFiles(PHOTO);
  await page.getByLabel('晴れ').check();
  await page.getByLabel('文章').fill(text);
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page).toHaveURL(/\/users\/[^/]+\/diaries\/\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByLabel('文章')).toBeVisible();
}

// 改行(空の行)と折り返しを含む、ちょうど400文字の文章
const LONG_TEXT = `${'きょうは こうえんで ともだちと あそびました。'.repeat(12)}\n\n${'ゆうがたに なって かえりました。'.repeat(12)}`.slice(0, 400);

/** 画面の幅からはみ出している要素を返す。失敗したときに原因の要素が分かるようにする */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const pageOverflow = document.documentElement.scrollWidth - width;
    const found = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 0.5 && !el.closest('.diary-page__picture'))
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} right=${el.getBoundingClientRect().right.toFixed(1)}`);
    return pageOverflow > 0 ? [`page overflow=${String(pageOverflow)}px`, ...found] : found;
  });
}

let user: SeededUser;
test.beforeEach(async ({ context }) => {
  user = await seedUser(uniqueHandle('pg'));
  await signInAs(context, user);
});

test.describe('editor', () => {
  test('(a) lays out the picture, the date and weather row, and the body from top to bottom', async ({ page }) => {
    await page.goto('/diaries/new');
    const [picture = 0, meta = 0, body = 0] = await sectionTops(page);
    expect(picture).toBeLessThan(meta);
    expect(meta).toBeLessThan(body);
    // 天気欄は日付欄と同じ行の右隣にある
    const day = await page.locator('.diary-page__day').boundingBox();
    const weather = await page.locator('.diary-page__weather').boundingBox();
    expect(weather?.x).toBeGreaterThan((day?.x ?? 0) + 1);
    expect(Math.abs((weather?.y ?? 0) - (day?.y ?? 0))).toBeLessThan(2);
  });

  test('(b)(c) writes horizontally on ruled lines that start at eight lines', async ({ page }) => {
    await page.goto('/diaries/new');
    const body = page.getByLabel('文章');
    await expect(body).toHaveCSS('writing-mode', 'horizontal-tb');
    const gap = await ruleGap(body);
    expect(gap).toBeGreaterThan(0);
    expect(await body.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))).toBeCloseTo(gap, 1);
    expect(await body.evaluate((el) => el.clientHeight)).toBeCloseTo(gap * 8, 0);
  });

  test('(d) adds a ruled line when the text grows past eight lines', async ({ page }) => {
    await page.goto('/diaries/new');
    const body = page.getByLabel('文章');
    const gap = await ruleGap(body);
    expect(gap).toBeGreaterThan(0);
    await body.fill(Array.from({ length: 9 }, (_, i) => `${String(i + 1)}ぎょうめ`).join('\n'));
    await expect.poll(() => body.evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(Math.round(gap * 9) - 1);
    const box = await body.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(box.scroll).toBeLessThanOrEqual(box.client);
  });

  test('(e) keeps 400 characters visible without scrolling inside the field', async ({ page }) => {
    await page.goto('/diaries/new');
    const body = page.getByLabel('文章');
    await expect(body).toHaveClass(/\bruled-text\b/);
    await body.fill('あ'.repeat(400));
    await expect(page.getByText('残り 0 文字')).toBeVisible();
    await expect
      .poll(() => body.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThanOrEqual(0);
    expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('(f) fits tall and wide pictures inside the picture frame', async ({ page }) => {
    await page.goto('/diaries/new');
    const frame = page.locator('.diary-page__picture');
    for (const [w, h] of [
      [300, 900],
      [1200, 300],
    ] as const) {
      await page.getByLabel('絵(画像)').setInputFiles(await image(w, h));
      const preview = frame.getByRole('img');
      await expect(preview).toBeVisible();
      const outer = await frame.boundingBox();
      const inner = await preview.evaluate((el) => {
        const img = el as HTMLImageElement;
        const box = img.getBoundingClientRect();
        // object-fit: contain で描かれる実際の絵の大きさ
        const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
        return { x: box.x, y: box.y, width: box.width, height: box.height, drawnW: img.naturalWidth * scale, drawnH: img.naturalHeight * scale, fit: getComputedStyle(img).objectFit };
      });
      expect(inner.fit).toBe('contain');
      expect(inner.x).toBeGreaterThanOrEqual((outer?.x ?? 0) - 0.5);
      expect(inner.y).toBeGreaterThanOrEqual((outer?.y ?? 0) - 0.5);
      expect(inner.x + inner.width).toBeLessThanOrEqual((outer?.x ?? 0) + (outer?.width ?? 0) + 0.5);
      expect(inner.y + inner.height).toBeLessThanOrEqual((outer?.y ?? 0) + (outer?.height ?? 0) + 0.5);
      // 縦横比を保つ
      expect(inner.drawnW / inner.drawnH).toBeCloseTo(w / h, 1);
    }
  });

  test('(g) chooses one weather in the weather field next to the date', async ({ page }) => {
    await page.goto('/diaries/new');
    const group = page.locator('.diary-page__weather').getByRole('group', { name: '天気' });
    await group.getByLabel('晴れ').check();
    await group.getByLabel('雨').check();
    await expect(group.getByLabel('雨')).toBeChecked();
    await expect(group.getByLabel('晴れ')).not.toBeChecked();
  });
});

test.describe('view', () => {
  test('(h) shows the saved diary with the same sections and ruled lines as the editor', async ({ page }) => {
    await page.goto('/diaries/new');
    const editorGap = await ruleGap(page.getByLabel('文章'));
    await writeDiary(page, 'みた めも おなじ');
    const [picture = 0, meta = 0, body = 0] = await sectionTops(page);
    expect(picture).toBeLessThan(meta);
    expect(meta).toBeLessThan(body);
    const text = page.getByLabel('文章');
    await expect(text).toHaveCSS('writing-mode', 'horizontal-tb');
    expect(await ruleGap(text)).toBeCloseTo(editorGap, 1);
    expect(await text.evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(Math.round(editorGap * 8) - 1);
  });

  test('(i) wraps the same text into the same number of lines as the editor', async ({ page }) => {
    await page.goto('/diaries/new');
    const editor = page.getByLabel('文章');
    await editor.fill(LONG_TEXT);
    const gap = await ruleGap(editor);
    const editorLines = await expect
      .poll(() => editor.evaluate((el, g) => Math.round(el.clientHeight / g), gap))
      .toBeGreaterThan(8)
      .then(() => editor.evaluate((el, g) => Math.round(el.clientHeight / g), gap));
    await page.getByLabel('絵(画像)').setInputFiles(PHOTO);
    await page.getByLabel('晴れ').check();
    await page.getByRole('button', { name: '保存する' }).click();
    const view = page.getByLabel('文章');
    await expect(view).toHaveText(LONG_TEXT, { useInnerText: true });
    expect(await view.evaluate((el, g) => Math.round(el.clientHeight / g), gap)).toBe(editorLines);
  });

  test('(j) shows an existing diary saved in the old format as a horizontal page', async ({ page }) => {
    await seedDiary(user, '2026-10-01', { body: 'まえに たてがきで かいた にっき', weather: 'snowy' });
    await page.goto(`/users/${user.handle}/diaries/2026-10-01`);
    const text = page.getByLabel('文章');
    await expect(text).toHaveText('まえに たてがきで かいた にっき');
    await expect(text).toHaveCSS('writing-mode', 'horizontal-tb');
    await expect(page.locator('.diary-page__weather')).toContainText('雪');
  });

  test('(k) shows the same page in the feed and on the author page for a follower', async ({ page }) => {
    const author = await seedUser(uniqueHandle('au'), 'public');
    await seedFollow(user, author);
    await seedDiary(author, '2026-10-02', { body: 'みんなに みせる ぺーじ', weather: 'cloudy' });
    for (const path of ['/feed', `/users/${author.handle}`]) {
      await page.goto(path);
      const card = page.locator('article.diary-page', { hasText: 'みんなに みせる ぺーじ' });
      await expect(card).toBeVisible();
      await expect(card.locator('.diary-page__body .ruled-text')).toHaveCSS('writing-mode', 'horizontal-tb');
      await expect(card.locator('.diary-page__day')).toHaveText('10月 2日(金)');
    }
  });

  test('(l) puts each line of text on its ruled line within a tenth of the line height', async ({ page }) => {
    await writeDiary(page, LONG_TEXT);
    const text = page.getByLabel('文章');
    const gap = await ruleGap(text);
    const offset = await cssLength(text, 'var(--rule-offset)');
    const gaps = await text.evaluate(
      (el, { gap: g, offset: o }) => {
        const top = el.getBoundingClientRect().top + parseFloat(getComputedStyle(el).paddingTop);
        const range = document.createRange();
        range.selectNodeContents(el);
        const bottoms = new Map<number, number>();
        for (const rect of range.getClientRects()) {
          if (rect.width === 0) continue;
          const line = Math.floor((rect.top - top) / g) + 1;
          bottoms.set(line, Math.max(bottoms.get(line) ?? 0, rect.bottom));
        }
        // k 行目の罫線(1px の線)の位置
        return [...bottoms].map(([line, bottom]) => Math.abs(bottom - (top + line * g - o - 0.5)));
      },
      { gap, offset },
    );
    expect(gaps.length).toBeGreaterThan(8);
    for (const diff of gaps) expect(diff).toBeLessThanOrEqual(gap * 0.1);
  });
});

test.describe('handwriting font and devices', () => {
  test('(m) shows the body, the date, and the weather in the Klee One handwriting font', async ({ page }) => {
    await writeDiary(page, 'てがきの もじ');
    for (const selector of ['.diary-page__body .ruled-text', '.diary-page__day', '.diary-page__weather']) {
      const family = await page.locator(selector).evaluate((el) => getComputedStyle(el).fontFamily);
      expect(family.split(',')[0]?.trim().replaceAll('"', '')).toBe('Klee One');
    }
    await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Klee One"', 'て'))).toBe(true);
  });

  test('(n) loads the font from this service only, without any external request', async ({ page, baseURL }) => {
    const origins = new Set<string>();
    const fonts: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') return;
      origins.add(url.origin);
      if (url.pathname.endsWith('.woff2')) fonts.push(url.pathname);
    });
    await page.goto('/diaries/new');
    await page.getByLabel('文章').fill('そとに つうしんしない');
    await expect.poll(() => fonts.length).toBeGreaterThan(0);
    await writeDiary(page, 'そとに つうしんしない');
    await page.evaluate(() => document.fonts.ready);
    expect([...origins]).toEqual([new URL(baseURL ?? '').origin]);
  });

  test('(o) fits the editor with 400 characters and the view in a 360px wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/diaries/new');
    await page.getByLabel('文章').fill(LONG_TEXT);
    await expect(page.getByText('残り 0 文字')).toBeVisible();
    expect(await overflowingElements(page)).toEqual([]);
    await page.getByLabel('絵(画像)').setInputFiles(PHOTO);
    await page.getByLabel('晴れ').check();
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByLabel('文章')).toBeVisible();
    expect(await overflowingElements(page)).toEqual([]);
  });

  test('(p) keeps the paper colors in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await writeDiary(page, 'くらい がめんでも かみの いろ');
    const page_ = page.locator('.diary-page');
    await expect(page_).toHaveCSS('background-color', 'rgb(230, 230, 230)');
    await expect(page.getByLabel('文章')).toHaveCSS('color', 'rgb(34, 34, 34)');
  });

  test('(q) shows emoji and symbols that the handwriting font lacks without dropping them', async ({ page }) => {
    // □(代わりの書体がない文字)にならないことは自動では判定できないため、quickstart の手動確認(15)で確かめる
    const text = 'たのしかった😀♪';
    await writeDiary(page, text);
    const body = page.getByLabel('文章');
    await expect(body).toHaveText(text);
    const widths = await body.evaluate((el) => {
      const node = el.firstChild;
      if (!node) return [];
      // 書記素(絵文字は1文字)ごとに、表示された幅を測る
      return [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(node.textContent ?? '')].map(({ index, segment }) => {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + segment.length);
        return range.getBoundingClientRect().width;
      });
    });
    expect(widths.length).toBe([...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)].length);
    for (const width of widths) expect(width).toBeGreaterThan(0);
  });
});
