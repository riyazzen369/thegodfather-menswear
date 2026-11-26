/* The wardrobe photos are drawn in 3D: reach the vault, check photoK, and capture the orbit mid-swipe (software GL). */
const { chromium } = require('playwright'); const { ARGS } = require('./gl'); const fs = require('fs'); const path = require('path')
const sleep = ms => new Promise(r => setTimeout(r, ms)); const OUT = path.join(__dirname, 'out', 'orbit3d'); fs.mkdirSync(OUT, { recursive: true })
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
;(async () => {
  const b = await chromium.launch({ args: ARGS }); const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage()
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(() => { sessionStorage.setItem('gf-entered', '1'); sessionStorage.setItem('gf-peek', '1') }); await p.reload(); await sleep(5000)
  await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium').click(); await sleep(2500); await p.locator('#walk-skip').click({ timeout: 4000 }).catch(() => {}); await sleep(9000)
  const k = () => p.evaluate(() => ({ view: window.__rig.view, p: +window.__rig.scrollP.toFixed(2), k: window.__rig.photoK.map(x => +x.toFixed(2)) }))
  let s = await k(); console.log(JSON.stringify(s)); ok(s.view === 'wardrobe', 'in the vault'); ok(s.k[0] > 0.9, '3D photo of piece 1 is drawn (k=' + s.k[0] + ')')
  await p.screenshot({ path: OUT + '/0-rest.png' }); await sleep(4000); await p.screenshot({ path: OUT + '/0b-rest.png' }); await p.addStyleTag({ content: '.track,.copy,.topbar,.bottombar{visibility:hidden!important}' }); await sleep(1500); await p.screenshot({ path: OUT + '/0c-3donly.png' }); console.log('canvas', JSON.stringify(await p.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { l: r.left, w: r.width, h: r.height, cw: c.width, ch: c.height, iw: innerWidth, vv: visualViewport.width, sx: scrollX, dpr: devicePixelRatio, trf: getComputedStyle(c).transform, par: c.parentElement.className } }))); console.log('later', JSON.stringify(await k()), JSON.stringify(await p.evaluate(() => [window.__pc0, window.__pc1])))
  await p.keyboard.press('ArrowRight')
  for (const [t, n] of [[150, 1], [250, 2], [300, 3], [400, 4]]) { await sleep(t); await p.screenshot({ path: OUT + `/${n}-mid.png` }); console.log(n, JSON.stringify(await k())) }
  await sleep(2500); s = await k(); ok(Math.abs(s.p - 1) < 0.05, 'settled on piece 2'); await p.screenshot({ path: OUT + '/9-settled.png' })
  // hold a drag part-way: static mid-orbit frames
  await p.addStyleTag({ content: '.track,.copy{visibility:visible!important}' })
  await p.mouse.move(300, 400); await p.mouse.down()
  for (const [dx, n] of [[-60, 'a'], [-150, 'b'], [-240, 'c']]) { await p.mouse.move(300 + dx, 400, { steps: 4 }); await sleep(2500); await p.screenshot({ path: OUT + `/drag-${n}.png` }); console.log('drag', n, JSON.stringify(await k())) }
  await p.mouse.up(); await sleep(2500)
  ok(errs.length === 0, 'no errors ' + errs.slice(0, 3).join(' | ')); await b.close(); process.exit(fails ? 1 : 0)
})()
