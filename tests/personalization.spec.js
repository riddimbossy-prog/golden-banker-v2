const { test, expect } = require('@playwright/test');

async function waitReady(page) {
  await page.waitForFunction(() =>
    document.documentElement.dataset.p2uPersonalizationReady === 'true' &&
    Boolean(window.P2UPersonalization?.isMounted?.()) &&
    Boolean(document.querySelector('#p2u-personalization-bar')),
  null, { timeout: 15000 });
}

async function resetPersonalization(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('p2u-personalization-v167');
    localStorage.setItem('p2u-onboarding-v157', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await expect(page.locator('[data-p2u-open]')).toBeVisible({ timeout: 10000 });
}

test('personalization controls are usable and persist on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 344, height: 882 });
  await resetPersonalization(page, '/board.html');

  await page.locator('[data-p2u-open]').click();
  await expect(page.locator('#p2u-personalization-panel')).toBeVisible();
  await expect(page.locator('[data-p2u-fav-engine]')).toHaveCount(16);

  await page.evaluate(() => window.P2UPersonalization.setPrefs({
    favoriteEngines: ['normal'],
    boardScope: 'mine',
    cardView: 'compact',
    savedFilter: { engine: 'top', league: 'all', search: 'united' }
  }));
  await page.locator('[data-p2u-close]').first().click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitReady(page);

  await expect(page.locator('body')).toHaveAttribute('data-p2u-card-view', 'compact');
  await expect(page.locator('[data-p2u-scope]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#f-search')).toHaveValue('united');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('p2u-personalization-v167')));
  expect(saved.cardView).toBe('compact');
  expect(saved.boardScope).toBe('mine');
  expect(saved.savedFilter.search).toBe('united');

  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
});

test('league favorites, hidden leagues and recent history are available', async ({ page }) => {
  await resetPersonalization(page, '/index.html');
  await page.evaluate(() => window.P2UPersonalization.setPrefs({
    favoriteLeagues: ['Test League'],
    hiddenLeagues: ['Hidden League'],
    recentMatches: [{
      key: 'test-home|test-away', home: 'Test Home', away: 'Test Away',
      league: 'Test League', market: 'Record', proof: 'proof.html', viewedAt: Date.now()
    }]
  }));
  await page.locator('[data-p2u-open]').click();
  await expect(page.locator('#p2u-personalization-panel')).toBeVisible();
  await expect(page.locator('.p2u-recent-item').first()).toContainText('Test Home vs Test Away');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('p2u-personalization-v167')));
  expect(saved.favoriteLeagues).toContain('Test League');
  expect(saved.hiddenLeagues).toContain('Hidden League');
  expect(saved.recentMatches).toHaveLength(1);
});
