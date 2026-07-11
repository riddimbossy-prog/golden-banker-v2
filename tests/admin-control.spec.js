const { test, expect } = require('@playwright/test');

async function waitReady(page, datasetKey, fallback) {
  await page.waitForFunction(({ datasetKey, fallback }) => {
    return document.documentElement.dataset[datasetKey] === 'true' || (fallback && Boolean(window[fallback]));
  }, { datasetKey, fallback }, { timeout: 30000 });
}

async function clearStorageOnce(page, url, localKeys = [], sessionKeys = []) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ localKeys, sessionKeys }) => {
    localKeys.forEach(key => localStorage.removeItem(key));
    sessionKeys.forEach(key => sessionStorage.removeItem(key));
  }, { localKeys, sessionKeys });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function setupPin(page, pin = '2468') {
  await clearStorageOnce(
    page,
    '/admin.html',
    ['p2u-admin-pin-v169', 'p2u-admin-draft-v169', 'p2u-admin-log-v169'],
    ['p2u-admin-session-v169']
  );
  await waitReady(page, 'p2uAdminReady');
  await expect(page.locator('#gate-title')).toContainText('Create local operator PIN');
  await page.locator('#admin-pin').fill(pin);
  await page.locator('#admin-pin-confirm').fill(pin);
  await page.locator('#gate-submit').click();
  await expect(page.locator('#admin-app')).toBeVisible();
}

test('operator console creates a local PIN and fits Z Fold cover', async ({ page }) => {
  await page.setViewportSize({ width: 344, height: 882 });
  await setupPin(page);
  await expect(page.locator('#kpi-engines')).toContainText('16/16');
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
});

test('publishing draft and community moderation persist locally', async ({ page }) => {
  await setupPin(page);
  await page.locator('[data-section="publishing"]').click({ force: true });
  await expect(page.locator('[data-section-panel="publishing"]')).toHaveClass(/active/);
  await page.locator('#announcement-enabled').evaluate(el => { el.checked = true; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#announcement-message').fill('Records have been refreshed.');
  await page.locator('#featured-leagues').fill('Premier League\nLa Liga');
  await page.locator('#save-draft').click();

  await page.locator('[data-section="community"]').click({ force: true });
  await expect(page.locator('[data-section-panel="community"]')).toHaveClass(/active/);
  await page.locator('#verify-id').fill('slip-test-1');
  await page.locator('#add-verified').click();
  await expect(page.locator('#verified-list')).toContainText('slip-test-1');

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('p2u-admin-draft-v169');
    return raw ? JSON.parse(raw) : null;
  })).toMatchObject({
    announcement: { enabled: true },
    community: { verifiedIds: expect.arrayContaining(['slip-test-1']) }
  });
});

test('public controls apply committed board and moderation configuration', async ({ page }) => {
  await page.route('**/admin-config.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.P2U_ADMIN_CONFIG={version:'test',board:{published:false,message:'Preparing records.'},announcement:{enabled:true,tone:'info',message:'Quiet update',linkLabel:'',linkUrl:'',expiresAt:''},featured:{engines:[],leagues:[]},community:{hiddenIds:[],verifiedIds:[]}};`
  }));
  await page.goto('/board.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.p2u-board-unpublished')).toContainText('Preparing records.');
  await expect(page.locator('#p2u-operator-note')).toContainText('Quiet update');
});
