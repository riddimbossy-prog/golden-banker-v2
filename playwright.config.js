const { defineConfig } = require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests',timeout:30000,retries:1,workers:1,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined}},
  webServer:{command:'npx http-server . -p 4173 -c-1',url:'http://127.0.0.1:4173',reuseExistingServer:true,timeout:30000}
});