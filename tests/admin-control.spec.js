const { test, expect } = require('@playwright/test');

async function installAdminMock(page,{role='owner'}={}){
  await page.addInitScript(({role})=>{
    const settings={id:'global',board_published:true,board_message:'Preparing today’s board.',announcement_enabled:false,announcement_tone:'info',announcement_message:'',announcement_link_label:'',announcement_link_url:'',announcement_expires_at:null,featured_engines:[],featured_leagues:[],release_version:'v181',updated_at:new Date().toISOString()};
    window.__P2U_ADMIN_MOCK__={
      session:{user:{id:'00000000-0000-0000-0000-000000000001',email:'owner@example.com'}},
      roleRow:role?{user_id:'00000000-0000-0000-0000-000000000001',role,active:true}:null,
      calls:[],settings,moderation:[],audit:[],deletions:[],roles:[{user_id:'00000000-0000-0000-0000-000000000001',role:'owner',active:true,updated_at:new Date().toISOString()}],
      async select(table,query){
        if(table==='p2u_site_settings')return this.settings;
        if(table==='p2u_community_moderation')return this.moderation;
        if(table==='p2u_admin_audit_log')return this.audit;
        if(table==='p2u_account_deletion_requests')return this.deletions;
        if(table==='p2u_admin_roles')return query&&query.maybeSingle?this.roleRow:this.roles;
        return query&&query.maybeSingle?null:[];
      },
      async rpc(name,args){
        this.calls.push({name,args});
        if(name==='p2u_admin_save_site_settings'){
          this.settings={...this.settings,...args.p_payload,updated_at:new Date().toISOString()};
          return this.settings;
        }
        if(name==='p2u_admin_moderate_community'){
          if(args.p_status==='clear')this.moderation=this.moderation.filter(x=>x.slip_id!==args.p_slip_id);
          else this.moderation=[{slip_id:args.p_slip_id,status:args.p_status,reason:args.p_reason,updated_at:new Date().toISOString()}];
          return this.moderation[0]||{slip_id:args.p_slip_id,status:'clear'};
        }
        return {};
      }
    };
  },{role});
}

async function waitAdmin(page){
  await page.waitForFunction(()=>document.documentElement.dataset.p2uBackendAdminReady==='true' && window.P2UBackendAdmin?.isReady?.(),null,{timeout:15000});
}

test('backend admin loads for an authorized owner and fits Z Fold cover', async ({page})=>{
  await installAdminMock(page);
  await page.setViewportSize({width:344,height:882});
  await page.goto('/admin.html',{waitUntil:'domcontentloaded'});
  await waitAdmin(page);
  await expect(page.locator('#admin-app')).toBeVisible();
  await expect(page.locator('#admin-role')).toHaveText('owner');
  await expect(page.locator('#metric-board')).toHaveText('Published');
  const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
});

test('publishing and moderation actions call protected backend RPCs', async ({page})=>{
  await installAdminMock(page);
  await page.goto('/admin.html',{waitUntil:'domcontentloaded'});
  await waitAdmin(page);
  await page.locator('[data-admin-tab="publishing"]').click();
  await page.locator('#announcement-enabled').check();
  await page.locator('#announcement-message').fill('Records refreshed.');
  await page.locator('#save-settings').click();
  await expect.poll(()=>page.evaluate(()=>window.__P2U_ADMIN_MOCK__.calls.some(x=>x.name==='p2u_admin_save_site_settings'))).toBeTruthy();
  await page.locator('[data-admin-tab="community"]').click();
  await page.locator('#moderation-slip-id').fill('slip-test-181');
  await page.locator('#moderate-verified').click();
  await expect.poll(()=>page.evaluate(()=>window.__P2U_ADMIN_MOCK__.calls.some(x=>x.name==='p2u_admin_moderate_community'&&x.args.p_status==='verified'))).toBeTruthy();
});

test('signed-in users without a role are denied', async ({page})=>{
  await installAdminMock(page,{role:null});
  await page.goto('/admin.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#gate-title')).toHaveText('Admin role required');
  await expect(page.locator('#admin-app')).toBeHidden();
});
