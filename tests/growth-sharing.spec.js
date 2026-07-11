const { test, expect } = require("@playwright/test");
test("growth sharing loads and decorates match cards", async ({ page }) => {
  await page.goto("/index.html");
  await expect.poll(async()=>page.evaluate(()=>!!window.P2UGrowthSharing)).toBe(true);
  await expect(page.locator("link[href=\"growth-sharing.css\"]")).toHaveCount(1);
  const cards=page.locator("[data-p2u-match-key]");
  if(await cards.count()) await expect(cards.first().locator(".p2u-share-card-btn")).toBeVisible();
});
test("share landing page is mobile safe", async ({ page }) => {
  await page.setViewportSize({width:344,height:882});
  await page.goto("/share.html?type=engine&name=Prime");
  await expect(page.locator("#share-title")).toHaveText("Prime");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  expect(overflow).toBeFalsy();
});
