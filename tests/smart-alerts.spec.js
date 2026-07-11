const { test, expect } = require('@playwright/test');

async function waitReady(page, datasetKey, fallback) {
  await page.waitForFunction(({ datasetKey, fallback }) => {
    return document.documentElement.dataset[datasetKey] === 'true' || (fallback && Boolean(window[fallback]));
  }, { datasetKey, fallback }, { timeout: 30000 });
}

async function resetAlerts(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('p2u-smart-alerts-v168');
    localStorage.removeItem('p2u-smart-alerts-match-snapshot-v168');
    localStorage.removeItem('p2u-smart-alerts-community-seen-v168');
    localStorage.setItem('p2u-onboarding-v157', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitReady(page, 'p2uSmartAlertsReady', 'P2USmartAlerts');
  await expect(page.locator('#p2u-alert-button')).toBeAttached();
  await expect(page.locator('#p2u-alert-button')).toBeVisible();
}

test('smart alert center opens and persists settings on Z Fold cover', async ({ page }) => {
  await page.setViewportSize({ width: 344, height: 882 });
  await resetAlerts(page, '/board.html');

  await page.locator('#p2u-alert-button').click({ force: true });
  await expect(page.locator('#p2u-alert-panel')).toBeVisible();
  await page.locator('[data-alert-settings]').click({ force: true });
  const verified = page.locator('[data-alert-toggle="verifiedOnly"]');
  await verified.click({ force: true });
  await expect(verified).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => page.evaluate(() => window.P2USmartAlerts.getState().verifiedOnly)).toBe(true);

  await page.locator('[data-alert-close]').first().click({ force: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitReady(page, 'p2uSmartAlertsReady', 'P2USmartAlerts');
  await page.locator('#p2u-alert-button').click({ force: true });
  await page.locator('[data-alert-settings]').click({ force: true });
  await expect(page.locator('[data-alert-toggle="verifiedOnly"]')).toHaveAttribute('aria-pressed', 'true');

  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
});

test('community win event creates a verified record alert', async ({ page }) => {
  await resetAlerts(page, '/community.html');
  await page.evaluate(() => {
    // A malformed/legacy personalization value must never crash Smart Alerts.
    localStorage.setItem('p2u-personalization-v167', 'null');
    window.P2USmartAlerts.communityWin({
      id: 'test-win-1',
      user: 'RecordKeeper',
      verified: true,
      league: 'Test League',
      body: 'Three public selections settled correctly.',
      url: 'community.html#test-win-1'
    });
  });

  await expect.poll(async () => page.evaluate(() =>
    window.P2USmartAlerts.getState().alerts.some(alert => alert.id === 'community-test-win-1')
  )).toBe(true);

  await page.locator('#p2u-alert-button').click({ force: true });
  await page.locator('[data-alert-tab="community"]').click({ force: true });
  const record = page.locator('[data-alert-id="community-test-win-1"]');
  await expect(record).toContainText('@RecordKeeper');
  await expect(record).toContainText('Verified');
  await expect(record).not.toContainText('payout');
});

test('community page exposes win alert controls', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 904 });
  await resetAlerts(page, '/community.html');
  await expect(page.locator('#p2u-community-alert-card')).toBeVisible();
  await expect(page.locator('[data-p2u-open-alerts]')).toBeVisible();
});
