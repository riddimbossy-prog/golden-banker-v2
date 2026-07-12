const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

test('news page exposes personalized, discussed and saved views', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/news.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-news-filter="foryou"]')).toBeVisible();
  await expect(page.locator('[data-news-filter="discussed"]')).toBeVisible();
  await expect(page.locator('[data-news-filter="saved"]')).toBeVisible();
  await expect(page.locator('#news-follow-input')).toBeVisible();
  await expect(page.locator('#news-follow-type')).toBeVisible();
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
});

test('v192 SQL includes follows, bookmarks, reports and moderation RPCs', async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'SUPABASE_NEWS_PERSONALIZATION_v192.sql'), 'utf8');
  expect(sql).toContain('p2u_news_follows');
  expect(sql).toContain('p2u_news_bookmarks');
  expect(sql).toContain('p2u_news_reports');
  expect(sql).toContain('p2u_admin_news_action');
  expect(sql).toContain('p2u_admin_news_resolve_report');
  expect(sql).toContain('personalized_news');
});

test('push dispatcher explains personalized news delivery', async () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'p2u-push-dispatch', 'index.ts'), 'utf8');
  expect(code).toContain('Matches followed topic');
  expect(code).toContain('breaking_news');
  expect(code).toContain('personalized_news');
  expect(code).toContain('reason: newsDecision.reason');
});
