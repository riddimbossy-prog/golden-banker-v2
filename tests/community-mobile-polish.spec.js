const { test, expect } = require('@playwright/test');

const profiles = [
  { name: 'very-small-280', width: 280, height: 653 },
  { name: 'small-320', width: 320, height: 700 },
  { name: 'zfold-cover-344', width: 344, height: 882 },
  { name: 'android-360', width: 360, height: 800 },
];

for (const profile of profiles) {
  test(`community picks are compact on ${profile.name}`, async ({ page }) => {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto('/community.html');
    await page.locator('#board').evaluate((host) => {
      host.innerHTML = `
        <div class="pick">
          <img class="fl" alt="Argentina" />
          <div class="who"><div class="t">CA Estudiantes v Atletico Mitre</div><div class="m">Primera Nacional · 2 engines: Ultra, Trend</div></div>
          <span class="mk">DC 1X</span>
          <button class="mini">+ Slip</button>
        </div>`;
    });
    const card = page.locator('#board .pick');
    await expect(card).toBeVisible();
    const layout = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const market = el.querySelector('.mk').getBoundingClientRect();
      const button = el.querySelector('button').getBoundingClientRect();
      return {
        cardWidth: r.width,
        viewport: document.documentElement.clientWidth,
        marketTop: Math.round(market.top),
        buttonTop: Math.round(button.top),
        height: r.height,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport + 1);
    expect(Math.abs(layout.marketTop - layout.buttonTop)).toBeLessThanOrEqual(2);
    expect(layout.height).toBeLessThan(190);
  });
}
