const { test, expect } = require('@playwright/test');
const pages=['board.html','engines.html','proof.html','scorecards.html','league-dna.html','community.html','trust.html','responsible-gambling.html','terms.html','privacy.html','disclaimer.html'];
const sizes=[{name:'cover-280',width:280,height:653},{name:'small-320',width:320,height:700},{name:'iphone-375',width:375,height:812},{name:'android-390',width:390,height:844},{name:'tablet-768',width:768,height:1024},{name:'desktop-1440',width:1440,height:1000}];
for(const size of sizes){
  for(const path of pages){
    test(`${path} · ${size.name} has no horizontal overflow`,async({page})=>{
      await page.setViewportSize({width:size.width,height:size.height});
      await page.goto('/'+path,{waitUntil:'domcontentloaded'});
      await page.waitForTimeout(300);
      const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(3);
      const title=await page.title();expect(title.length).toBeGreaterThan(2);
      const dup=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);return [...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];});
      expect(dup).toEqual([]);
    });
  }
}
test('official logo loads',async({page})=>{await page.goto('/board.html');const img=page.locator('img[src*="predict2u-logo"]').first();await expect(img).toBeVisible();expect(await img.evaluate(x=>x.naturalWidth)).toBeGreaterThan(10);});
test('health widget and Trust Center are reachable',async({page})=>{await page.goto('/board.html');await expect(page.locator('#p2u-health-button')).toBeVisible();await page.goto('/trust.html');await expect(page.getByText('How every verdict is built—and checked.')).toBeVisible();});