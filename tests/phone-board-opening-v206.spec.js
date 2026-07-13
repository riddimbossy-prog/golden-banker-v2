const { test, expect } = require('@playwright/test');

test('phone board rails do not overlap or launch off the left edge', async ({ page }) => {
  await page.setViewportSize({ width: 354, height: 800 });
  await page.goto('/board.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    const engines = document.querySelector('#engine-pills');
    engines.innerHTML = ['All Engines','Today’s Matches','Normal','Strict','Ultra','Elite','Apex']
      .map((label, i) => `<button class="pill${i === 0 ? ' on' : ''}">${label}</button>`).join('');
    const dates = document.querySelector('#date-strip');
    dates.innerHTML = ['SAT 11 JUL','SUN 12 JUL','TODAY 13 JUL','TUE 14 JUL','WED 15 JUL']
      .map((label, i) => { const [day,d,m] = label.split(' '); return `<button class="date-chip${i === 2 ? ' on' : ''}"><span class="date-chip-day">${day}</span><span class="date-chip-date">${d} ${m}</span><span class="date-chip-count">31 games</span></button>`; }).join('');
  });

  const report = await page.evaluate(() => {
    const pills = [...document.querySelectorAll('#engine-pills .pill')].map(el => {
      const r = el.getBoundingClientRect();
      return { left:r.left, right:r.right, width:r.width, scrollWidth:el.scrollWidth, clientWidth:el.clientWidth, shrink:getComputedStyle(el).flexShrink };
    });
    const dates = document.querySelector('#date-strip').getBoundingClientRect();
    const firstDate = document.querySelector('#date-strip .date-chip').getBoundingClientRect();
    return {
      pills,
      engineOverflow:getComputedStyle(document.querySelector('#engine-pills')).overflowX,
      dateLeft:dates.left,
      firstDateLeft:firstDate.left,
      viewport:innerWidth
    };
  });

  expect(['auto','scroll']).toContain(report.engineOverflow);
  expect(report.pills.every(p => p.shrink === '0')).toBeTruthy();
  expect(report.pills.every(p => p.clientWidth >= p.scrollWidth - 1)).toBeTruthy();
  expect(report.firstDateLeft).toBeGreaterThanOrEqual(report.dateLeft - 1);
  expect(report.dateLeft).toBeGreaterThanOrEqual(-1);
});
