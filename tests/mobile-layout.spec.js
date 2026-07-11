const { test, expect } = require('@playwright/test');

const pages = [
  'index.html', 'board.html', 'engines.html', 'proof.html', 'scorecards.html',
  'league-dna.html', 'community.html', 'trust.html',
  'responsible-gambling.html', 'terms.html', 'privacy.html',
  'disclaimer.html', '404.html'
];

const sizes = [
  { name: 'very-small-280', width: 280, height: 653 },
  { name: 'small-320', width: 320, height: 700 },
  { name: 'zfold-cover-344', width: 344, height: 882 },
  { name: 'android-360', width: 360, height: 800 },
  { name: 'iphone-375', width: 375, height: 812 },
  { name: 'android-390', width: 390, height: 844 },
  { name: 'large-phone-412', width: 412, height: 915 },
  { name: 'small-tablet-600', width: 600, height: 960 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-820', width: 820, height: 1180 },
  { name: 'zfold-inner-768x904', width: 768, height: 904 },
  { name: 'zfold-landscape-904x768', width: 904, height: 768 },
  { name: 'tablet-landscape-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 1000 }
];

for (const size of sizes) {
  for (const path of pages) {
    test(`${path} · ${size.name} has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/' + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);

      const overflowReport = await page.evaluate(() => {
        const overflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
        const offenders = [...document.querySelectorAll('body *')]
          .map(el => {
            const r = el.getBoundingClientRect();
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id || '',
              className: typeof el.className === 'string' ? el.className.slice(0, 100) : '',
              left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
              scrollWidth: el.scrollWidth, clientWidth: el.clientWidth
            };
          })
          .filter(x => x.right > window.innerWidth + 3 || x.left < -3 || x.scrollWidth > x.clientWidth + 3)
          .slice(0, 12);
        return { overflow, offenders };
      });
      expect(overflowReport.overflow, JSON.stringify(overflowReport.offenders, null, 2)).toBeLessThanOrEqual(3);

      const title = await page.title();
      expect(title.length).toBeGreaterThan(2);

      const duplicates = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(x => x.id);
        return [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
      });
      expect(duplicates).toEqual([]);
    });
  }
}

test('official logo loads', async ({ page }) => {
  await page.goto('/board.html');
  const img = page.locator('img[src*="predict2u-logo"]').first();
  await expect(img).toBeVisible();
  expect(await img.evaluate(x => x.naturalWidth)).toBeGreaterThan(10);
});

test('health widget and Trust Center are reachable', async ({ page }) => {
  await page.goto('/board.html');
  await expect(page.locator('#p2u-health-button')).toBeVisible();
  await page.goto('/trust.html');
  await expect(page.getByText('How every verdict is built—and checked.')).toBeVisible();
});

test('brand experience features are present', async ({ page }) => {
  await page.goto('/board.html');
  const onboarding = page.locator('.p2u-onboard-backdrop');
  if (await onboarding.isVisible()) await page.locator('[data-close]').click();
  await expect(page.locator('#board-rank-reason'), 'Overview ranking explanation host is missing').toBeAttached();
  await page.goto('/engines.html');
  await expect(page.locator('#ranked-explainer'), 'Full Board ranking explanation host is missing').toBeAttached();
});

test('favicon and social metadata are present', async ({ page }) => {
  await page.goto('/board.html');
  expect(await page.locator('link[rel="icon"][sizes="32x32"]').count()).toBeGreaterThan(0);
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toContain('social-preview.png');
});

test('404 page is branded', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.getByText('This page could not be found.')).toBeVisible();
  await expect(page.locator('img[src="predict2u-logo.png"]')).toBeVisible();
});

test('mobile date rail is compact, readable and touch-scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/board.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const rail = page.locator('#date-strip');
  await expect(rail).toBeVisible();
  const chips = rail.locator('.date-chip');
  expect(await chips.count()).toBeGreaterThan(0);

  const layout = await page.evaluate(() => {
    const rail = document.querySelector('#date-strip');
    const chip = rail && rail.querySelector('.date-chip');
    const day = chip && chip.querySelector('.date-chip-day');
    const date = chip && chip.querySelector('.date-chip-date');
    const count = chip && chip.querySelector('.date-chip-count');
    if (!rail || !chip || !day || !date || !count) return null;
    const rr = rail.getBoundingClientRect();
    const cr = chip.getBoundingClientRect();
    return {
      railWidth: Math.round(rr.width),
      chipWidth: Math.round(cr.width),
      chipRight: Math.round(cr.right),
      viewport: window.innerWidth,
      overflowX: getComputedStyle(rail).overflowX,
      dayWhiteSpace: getComputedStyle(day).whiteSpace,
      dateWhiteSpace: getComputedStyle(date).whiteSpace,
      countWhiteSpace: getComputedStyle(count).whiteSpace,
      dayText: day.textContent.trim(),
      dateText: date.textContent.trim()
    };
  });

  expect(layout).not.toBeNull();
  expect(layout.chipWidth).toBeLessThanOrEqual(82);
  expect(['auto', 'scroll']).toContain(layout.overflowX);
  expect(layout.dayWhiteSpace).toBe('nowrap');
  expect(layout.dateWhiteSpace).toBe('nowrap');
  expect(layout.countWhiteSpace).toBe('nowrap');
  expect(layout.dayText.length).toBeGreaterThan(2);
  expect(layout.dateText).toMatch(/^\d{2} [A-Z]{3}$/);
});
