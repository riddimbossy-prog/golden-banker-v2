const { test, expect } = require('@playwright/test');

const sizes = [
  { name: 'small-phone', width: 320, height: 700 },
  { name: 'android-phone', width: 393, height: 852 },
  { name: 'z-fold-cover', width: 344, height: 882 },
  { name: 'tablet-fold-open', width: 768, height: 904 },
  { name: 'z-fold-landscape', width: 884, height: 740 },
  { name: 'tablet-wide', width: 1180, height: 820 }
];

for (const size of sizes) {
  test(`movable slip button stays visible and clear of navigation · ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/board.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const fab = page.locator('#p2u-slip-fab');
    await expect(fab).toBeVisible();
    await expect(fab).toHaveAttribute('aria-label', /Drag to move/i);

    const initial = await fab.boundingBox();
    expect(initial).not.toBeNull();
    expect(initial.x).toBeGreaterThanOrEqual(0);
    expect(initial.y).toBeGreaterThanOrEqual(0);
    expect(initial.x + initial.width).toBeLessThanOrEqual(size.width + 1);
    expect(initial.y + initial.height).toBeLessThanOrEqual(size.height + 1);

    const nav = page.locator('.p2u-mobile-app-nav');
    if (await nav.isVisible()) {
      const nr = await nav.boundingBox();
      expect(initial.y + initial.height).toBeLessThanOrEqual(nr.y - 8);
    }

    const targetX = Math.max(18, Math.round(size.width * 0.16));
    const targetY = Math.max(130, Math.round(size.height * 0.28));
    await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);

    const moved = await fab.boundingBox();
    expect(moved).not.toBeNull();
    expect(Math.abs(moved.x - initial.x) + Math.abs(moved.y - initial.y)).toBeGreaterThan(30);
    expect(moved.x).toBeGreaterThanOrEqual(8);
    expect(moved.y).toBeGreaterThanOrEqual(8);

    // Releasing a drag must not accidentally open the drawer.
    await expect(page.locator('#p2u-slip-drawer')).not.toHaveClass(/open/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(450);
    const restored = await page.locator('#p2u-slip-fab').boundingBox();
    expect(restored).not.toBeNull();
    expect(Math.abs(restored.x - moved.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(restored.y - moved.y)).toBeLessThanOrEqual(8);

    await page.locator('#p2u-slip-fab').click();
    await expect(page.locator('#p2u-slip-drawer')).toHaveClass(/open/);
  });
}
