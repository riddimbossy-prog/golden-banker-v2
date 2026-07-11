const { test, expect } = require('@playwright/test');

async function resetPersonalization(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('p2u-personalization-v167');
    localStorage.setItem('p2u-onboarding-v157', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.P2UPersonalization && window.P2UPersonalization.isMounted()));
  await expect(page.locator('#p2u-personalization-bar')).toBeVisible();
}

test('personalization controls are usable and persist on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 344, height: 882 });
  await resetPersonalization(page, '/board.html');

  await page.locator('[data-p2u-open]').click();
  await expect(page.locator('#p2u-personalization-panel')).toBeVisible();

  const engineChoices = page.locator('[data-p2u-fav-engine]');
  await expect(engineChoices).toHaveCount(16);
  await engineChoices.first().click();
  await expect(engineChoices.first()).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-p2u-close]').first().click();
  await page.locator('[data-p2u-scope]').click();
  await expect(page.locator('[data-p2u-scope]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-p2u-view="compact"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-p2u-card-view', 'compact');

  const search = page.locator('#f-search');
  await search.fill('united');
  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('p2u-personalization-v167');
    return raw ? JSON.parse(raw).savedFilter.search : '';
  })).toBe('united');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.P2UPersonalization && window.P2UPersonalization.isMounted()));

  await expect(page.locator('body')).toHaveAttribute('data-p2u-card-view', 'compact');
  await expect(page.locator('[data-p2u-scope]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#f-search')).toHaveValue('united');

  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
});

test('league favorites, hidden leagues and recent history are available', async ({ page }) => {
  await resetPersonalization(page, '/index.html');
  await page.locator('[data-p2u-open]').click();

  const leagueRows = page.locator('.p2u-league-row');
  if (await leagueRows.count()) {
    await leagueRows.first().locator('[data-p2u-fav-league]').click();
    await expect(leagueRows.first().locator('[data-p2u-fav-league]')).toHaveAttribute('aria-pressed', 'true');
    await leagueRows.first().locator('[data-p2u-hide-league]').click();
    await expect(leagueRows.first().locator('[data-p2u-hide-league]')).toHaveAttribute('aria-pressed', 'true');
  }

  await page.locator('[data-p2u-close]').first().click();
  const details = page.locator('#cards .btn-det').first();
  if (await details.count()) {
    await details.click();
    await expect.poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('p2u-personalization-v167');
      return raw ? JSON.parse(raw).recentMatches.length : 0;
    })).toBeGreaterThan(0);
    await page.locator('[data-p2u-open]').click();
    await expect(page.locator('.p2u-recent-item').first()).toBeVisible();
  }
});
