const { chromium } = require('playwright'); const { ARGS } = require('./gl'); const path = require('path'); const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => { const b = await chromium.launch({ args: ARGS }); const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage()
  await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(() => sessionStorage.setItem('gf-entered', '1')); await p.reload(); await sleep(9000)
  await p.screenshot({ path: path.join(__dirname, 'out', 'sf-phone.png') }); await b.close() })()
