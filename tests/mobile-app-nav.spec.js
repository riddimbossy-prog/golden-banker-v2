const { test, expect } = require('@playwright/test');

const pages = ['index.html','board.html','engines.html','proof.html','scorecards.html','league-dna.html','community.html','trust.html','responsible-gambling.html','terms.html','privacy.html','disclaimer.html','404.html'];

test('all public pages have global mobile app navigation', async ({ page }) => {
  await page.setViewportSize({ width: 344, height: 882 });
  for (const file of pages) {
    await page.goto(`/${file}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      document.documentElement.dataset.p2uMobileNavReady === 'true' &&
      document.querySelectorAll('.p2u-mobile-app-nav a').length === 4,
    null, { timeout: 15000 });
    const nav = page.locator('.p2u-mobile-app-nav');
    await expect(nav, `${file} mobile navigation`).toBeVisible();
    await expect(nav.locator('span')).toHaveText(['Board','Games','Results','Community']);
  }
});

test('critical health badge is removed on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 344, height: 882 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { const b = document.getElementById('p2u-health-button'); if (b) b.dataset.state = 'critical'; });
  const btn = page.locator('#p2u-health-button');
  if (await btn.count()) await expect(btn).toBeHidden();
});
