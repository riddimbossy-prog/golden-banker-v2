const { test, expect } = require('@playwright/test');

async function waitReady(page, datasetKey, fallback) {
  await page.waitForFunction(({ datasetKey, fallback }) => {
    return document.documentElement.dataset[datasetKey] === 'true' || (fallback && Boolean(window[fallback]));
  }, { datasetKey, fallback }, { timeout: 30000 });
}

async function resetPersonalization(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('p2u-personalization-v167');
    localStorage.setItem('p2u-onboarding-v157', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitReady(page, 'p2uPersonalizationReady', 'P2UPersonalization');
  await expect(page.locator('#p2u-personalization-bar')).toBeAttached();
  await expect(page.locator('[data-p2u-open]')).toBeVisible();
}

test('personalization controls are usable and persist on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 344, height: 882 });
  await resetPersonalization(page, '/board.html');

  await page.locator('[data-p2u-open]').click({ force: true });
  await expect(page.locator('#p2u-personalization-panel')).toBeVisible();

  const engineChoices = page.locator('[data-p2u-fav-engine]');
  await expect(engineChoices).toHaveCount(16);
  await engineChoices.first().click({ force: true });
  await expect(engineChoices.first()).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-p2u-close]').first().click({ force: true });
  await page.locator('[data-p2u-scope]').click({ force: true });
  await expect(page.locator('[data-p2u-scope]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-p2u-view="compact"]').click({ force: true });
  await expect(page.locator('body')).toHaveAttribute('data-p2u-card-view', 'compact');

  const search = page.locator('#f-search');
  await search.fill('united');
  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('p2u-personalization-v167');
    return raw ? JSON.parse(raw).savedFilter.search : '';
  })).toBe('united');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitReady(page, 'p2uPersonalizationReady', 'P2UPersonalization');

  await expect(page.locator('body')).toHaveAttribute('data-p2u-card-view', 'compact');
  await expect(page.locator('[data-p2u-scope]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#f-search')).toHaveValue('united');

  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
});

test('league favorites, hidden leagues and recent history are available', async ({ page }) => {
  await resetPersonalization(page, '/index.html');
  await page.locator('[data-p2u-open]').click({ force: true });

  const leagueRows = page.locator('.p2u-league-row');
  if (await leagueRows.count()) {
    await leagueRows.first().locator('[data-p2u-fav-league]').click({ force: true });
    await expect(leagueRows.first().locator('[data-p2u-fav-league]')).toHaveAttribute('aria-pressed', 'true');
    await leagueRows.first().locator('[data-p2u-hide-league]').click({ force: true });
    await expect(leagueRows.first().locator('[data-p2u-hide-league]')).toHaveAttribute('aria-pressed', 'true');
  }

  await page.locator('[data-p2u-close]').first().click({ force: true });
  const details = page.locator('#cards .btn-det').first();
  if (await details.count()) {
    await details.click({ force: true });
    await expect.poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('p2u-personalization-v167');
      return raw ? JSON.parse(raw).recentMatches.length : 0;
    })).toBeGreaterThan(0);
    await page.locator('[data-p2u-open]').click({ force: true });
    await expect(page.locator('.p2u-recent-item').first()).toBeVisible();
  }
});
