const { test, expect } = require('@playwright/test');
const pages=['index.html','board.html','engines.html','proof.html','scorecards.html','league-dna.html','community.html','share.html','admin.html','account.html'];
for(const page of pages){
  test(`${page} loads official brand and football asset layer`,async({page:p})=>{
    await p.goto(`/${page}`);
    await expect.poll(()=>p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--p2u-brand-green').trim())).toBe('#77c41c');
    await expect(p.locator('link[href="brand-performance.css"]')).toHaveCount(1);
    await expect(p.locator('script[src="football-assets.js"]')).toHaveCount(1);
  });
}
test('win carousel is slowed and readable',async({page})=>{
  await page.goto('/index.html');
  const duration=await page.locator('.cara').evaluate(el=>getComputedStyle(el).animationDuration);
  const seconds=parseFloat(duration);
  expect(seconds).toBeGreaterThanOrEqual(90);
});
test('football asset helper is available',async({page})=>{
  await page.goto('/board.html');
  await expect.poll(()=>page.evaluate(()=>Boolean(window.P2UFootballAssets))).toBe(true);
});
