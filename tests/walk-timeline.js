/* Prints the view over time after choosing the Elite Wardrobe (walk -> vault timeline). */
const { chromium } = require('playwright'); const { ARGS } = require('./gl'); const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => { const b = await chromium.launch({ args: ARGS }); const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage()
  await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(() => { sessionStorage.setItem('gf-entered', '1') }); await p.reload(); await sleep(5000)
  await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium').click(); const t0 = Date.now(); const out = []
  for (let i = 0; i < 14; i++) { await sleep(500); out.push(((Date.now() - t0) / 1000).toFixed(1) + 's:' + await p.evaluate(() => window.__rig.view + '/' + (window.__rig.walkAt ? 'walking' : 'nowalk'))) }
  console.log(out.join(' ')); await b.close() })()
