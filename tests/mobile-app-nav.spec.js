const {test,expect}=require('@playwright/test');
const pages=['index.html','board.html','engines.html','proof.html','scorecards.html','league-dna.html','community.html','trust.html','responsible-gambling.html','terms.html','privacy.html','disclaimer.html','404.html'];
for(const page of pages){
  test(`${page} has global mobile app navigation`,async({page:browserPage})=>{
    await browserPage.setViewportSize({width:344,height:882});
    await browserPage.goto(`/${page}`, {waitUntil:'domcontentloaded'});
    await browserPage.waitForFunction(() => document.documentElement.dataset.p2uMobileNavReady === 'true');
    const nav=browserPage.locator('.p2u-mobile-app-nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('a')).toHaveCount(4);
    await expect(nav.locator('span').allTextContents()).resolves.toEqual(['Board','Games','Results','Community']);
  });
}
test('critical health badge is removed on mobile',async({page})=>{
  await page.setViewportSize({width:344,height:882});
  await page.goto('/index.html');
  await page.evaluate(()=>{const b=document.getElementById('p2u-health-button');if(b)b.dataset.state='critical';});
  const btn=page.locator('#p2u-health-button');
  if(await btn.count())await expect(btn).toBeHidden();
});
