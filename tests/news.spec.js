const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

test('global football news page exposes filters and discussion', async ({ page }) => {
  await page.setViewportSize({ width: 344, height: 882 });
  await page.goto('/news.html', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Football news.*Transfer intelligence/i })).toBeVisible();
  await expect(page.locator('[data-news-filter]')).toHaveCount(7);
  await expect(page.locator('.p2u-news-hero-art img')).toHaveAttribute('src', /predict2u-transfers\.webp/);
  await expect(page.locator('[data-news-hero-filter="transfer"]')).toBeVisible();
  await expect(page.locator('#news-discussion-panel')).toBeAttached();
  await expect(page.locator('.p2u-mobile-app-nav [data-p2u-mobile-nav="news"]')).toBeVisible();
  await expect(page.locator('.p2u-mobile-app-nav [data-p2u-mobile-nav="news"]')).toHaveClass(/is-active/);
});

test('news page is mobile safe at 280px', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 653 });
  await page.goto('/news.html', { waitUntil: 'domcontentloaded' });
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
});

test('Add to Slip uses a solid high contrast brand button', async ({ page }) => {
  await page.goto('/board.html', { waitUntil: 'domcontentloaded' });
  const button = page.locator('.slip-add').first();
  if (await button.count()) {
    const style = await button.evaluate(el => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, color: cs.color, opacity: Number(cs.opacity), height: el.getBoundingClientRect().height };
    });
    expect(style.background).toBe('rgb(119, 196, 28)');
    expect(style.color).toBe('rgb(7, 16, 0)');
    expect(style.opacity).toBe(1);
    expect(style.height).toBeGreaterThanOrEqual(38);
  }
});


test('news sync can enrich real publisher images', async () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'p2u-news-sync', 'index.ts'), 'utf8');
  expect(code).toContain('og:image');
  expect(code).toContain('twitter:image');
  expect(code).toContain('imageFromArticlePage');
  expect(code).toContain('ignoreDuplicates: false');
  expect(code).toContain('canonicalKey');
  expect(code).toContain('source_verified');
});
