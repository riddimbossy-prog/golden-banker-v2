const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

test('v197 news bundle includes adaptive schema fallback and typo tolerance', async () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'news-app-v197.js'), 'utf8');
  expect(code).toContain("const MODERN_FIELDS=");
  expect(code).toContain("const BASE_FIELDS=");
  expect(code).toContain("const MIN_FIELDS=");
  expect(code).toContain("isSchemaError");
  expect(code).toContain("runArticleQuery");
  expect(code).toContain("loadArticleCache");
  expect(code).toContain("fuzzyMatch");
  expect(code).toContain("nearestKnown");
});

test('v197 news page exposes service and search status regions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/news.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#news-service-status')).toBeAttached();
  await expect(page.locator('#news-search-help')).toBeAttached();
  await expect(page.locator('#news-search')).toHaveAttribute('spellcheck', 'true');
});

test('share action is labelled and styled for visibility', async () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'news-app-v197.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'news.css'), 'utf8');
  expect(code).toContain('p2u-news-share-action');
  expect(code).toContain('<span>Share</span>');
  expect(css).toContain('.p2u-news-actions .p2u-news-share-action');
  expect(css).toContain('border-color:var(--news-green)');
});
