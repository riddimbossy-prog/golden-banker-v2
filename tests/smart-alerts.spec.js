const { test, expect } = require('@playwright/test');

async function resetAlerts(page) {
  await page.addInitScript(() => {
    localStorage.removeItem('p2u-smart-alerts-v168');
    localStorage.removeItem('p2u-smart-alerts-match-snapshot-v168');
    localStorage.removeItem('p2u-smart-alerts-community-seen-v168');
    localStorage.setItem('p2u-onboarding-v157', '1');
  });
}

test('smart alert center opens and persists settings on Z Fold cover', async ({ page }) => {
  await resetAlerts(page);
  await page.setViewportSize({ width: 344, height: 882 });
  await page.goto('/board.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#p2u-alert-button')).toBeVisible();
  await page.locator('#p2u-alert-button').click();
  await expect(page.locator('#p2u-alert-panel')).toBeVisible();
  await page.locator('[data-alert-settings]').click();
  const verified = page.locator('[data-alert-toggle="verifiedOnly"]');
  await verified.click();
  await expect(verified).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-alert-close]').first().click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#p2u-alert-button').click();
  await page.locator('[data-alert-settings]').click();
  await expect(page.locator('[data-alert-toggle="verifiedOnly"]')).toHaveAttribute('aria-pressed', 'true');
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
});

test('community win event creates a verified record alert', async ({ page }) => {
  await resetAlerts(page);
  await page.goto('/community.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.P2USmartAlerts.communityWin({
      id: 'test-win-1',
      user: 'RecordKeeper',
      verified: true,
      league: 'Test League',
      body: 'Three public selections settled correctly.',
      url: 'community.html#test-win-1'
    });
  });
  await page.locator('#p2u-alert-button').click();
  await page.locator('[data-alert-tab="community"]').click();
  await expect(page.locator('[data-alert-id="community-test-win-1"]')).toContainText('@RecordKeeper');
  await expect(page.locator('[data-alert-id="community-test-win-1"]')).toContainText('Verified');
  await expect(page.locator('[data-alert-id="community-test-win-1"]')).not.toContainText('payout');
});

test('community page exposes win alert controls', async ({ page }) => {
  await resetAlerts(page);
  await page.setViewportSize({ width: 768, height: 904 });
  await page.goto('/community.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#p2u-community-alert-card')).toBeVisible();
  await expect(page.locator('[data-p2u-open-alerts]')).toBeVisible();
});
