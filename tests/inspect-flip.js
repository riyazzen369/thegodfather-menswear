// Drag-to-flip inspect for every ITEM at 390x844 (touch) and 1440x900 (mouse):
// slow drag follows 1:1 and lands on the back, a fast fling flips back, the button and arrow keys flip, no page errors.
// SHOTS=1 saves mobile front/back of item ONLY (default 10, the bandhgala) to shots/.
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = process.env.URL || 'http://localhost:8795/'; const OUT = path.join(__dirname, '..', 'shots'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let bad = 0, n0 = 0; const ok = (name, pass, info = '') => { if (!pass) bad++; n0++; if (!pass || process.env.VERBOSE) console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : '')) }
  for (const [W, H] of (process.env.VPS || '390x844,1440x900').split(',').map(v => v.split('x').map(Number))) {
    const mob = W < 700, c = await b.newContext({ viewport: { width: W, height: H }, isMobile: mob, hasTouch: mob, deviceScaleFactor: 1 }); const p = await c.newPage()
    const errs = []; p.on('pageerror', e => errs.push(e.message)); const cdp = mob ? await c.newCDPSession(p) : null
    await p.goto(URL + '?force3d&q=low'); await p.evaluate(() => sessionStorage.setItem('gf-entered', '1')); await p.reload(); await sleep(4500)
    await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium').click({ force: true }); await sleep(1200); await p.keyboard.press('Escape'); await sleep(3000)
    const n = Math.min(+(process.env.N || 99), await p.evaluate(() => document.querySelectorAll('.slide[data-i]').length) - 1)
    const drag = async (x0, y, dx, steps, ms) => {
      if (mob) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] }); for (let s = 1; s <= steps; s++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx * s / steps, y }] }); await sleep(ms / steps) } return cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
      await p.mouse.move(x0, y); await p.mouse.down(); for (let s = 1; s <= steps; s++) { await p.mouse.move(x0 + dx * s / steps, y); await sleep(ms / steps) } await p.mouse.up()
    }
    const F = () => p.evaluate(() => window.__inspectFlip())
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 20 && await p.evaluate(() => window.__rig.index) !== i; k++) { await p.keyboard.press(await p.evaluate(() => window.__rig.index) < i ? 'ArrowRight' : 'ArrowLeft'); await sleep(700) }
      await p.waitForFunction(() => { const r = window.__rig; return Math.abs(r.scrollP - Math.round(r.scrollP)) < 0.002 }, null, { timeout: 15000 })
      await p.locator('.slide.is-active .details').click({ force: true }); await p.waitForSelector('.inspect.ready', { timeout: 15000 }); await sleep(700)
      const card = await p.locator('.flip-card').boundingBox(), y = card.y + card.height * 0.5, cx = card.x + card.width / 2
      let f = await F(); ok(`${W} item ${i}: opens on the front`, f.face === 'front' && f.a === 0, JSON.stringify(f))
      if (process.env.SHOTS && mob && i === +(process.env.ONLY || 10)) await p.locator('.inspect-stage').screenshot({ path: path.join(OUT, `flip-${W}-${i}-front.png`) })
      // slow drag right by 70% of the card: follows the finger (~126°), then settles on the back
      if (mob) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - card.width * 0.35, y }] }); for (let s = 1; s <= 12; s++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - card.width * 0.35 + card.width * 0.7 * s / 12, y }] }); await sleep(60) } }
      else { await p.mouse.move(cx - card.width * 0.35, y); await p.mouse.down(); for (let s = 1; s <= 12; s++) { await p.mouse.move(cx - card.width * 0.35 + card.width * 0.7 * s / 12, y); await sleep(60) } }
      await sleep(200); const held = await F()
      if (mob) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await p.mouse.up()
      await sleep(1300); f = await F()
      ok(`${W} item ${i}: drag follows 1:1 then lands on the back`, Math.abs(held.a - 126) < 12 && f.face === 'back' && Math.abs(f.a - 180) < 0.5, `held ${held.a.toFixed(1)}°, rest ${f.a.toFixed(1)}° ${f.face}`)
      if (process.env.SHOTS && mob && i === +(process.env.ONLY || 10)) await p.locator('.inspect-stage').screenshot({ path: path.join(OUT, `flip-${W}-${i}-back.png`) })
      // fling: short and fast (~18% of the card in 60 ms) still flips on
      await drag(cx, y, card.width * 0.18, 3, 60); await sleep(1300); f = await F()
      ok(`${W} item ${i}: a fast fling flips to the front`, f.face === 'front' && Math.abs(f.a - 360) < 0.5, `${f.a.toFixed(1)}° ${f.face} `)
      // a short slow drag springs back to the same face
      await drag(cx, y, card.width * 0.2, 10, 600); await sleep(1300); f = await F()
      ok(`${W} item ${i}: short slow drag springs back`, f.face === 'front' && Math.abs(f.a - 360) < 0.5, `${f.a.toFixed(1)}°`)
      await p.locator('#inspect-flip').click(); await sleep(1200); f = await F()
      const lbl = await p.locator('#inspect-flip').innerText()
      ok(`${W} item ${i}: button flips (label updates)`, f.face === 'back' && /front/i.test(lbl), `${f.face} "${lbl}"`)
      await p.keyboard.press('ArrowLeft'); await sleep(1200); f = await F()
      ok(`${W} item ${i}: arrow key flips`, f.face === 'front', f.face)
      await p.keyboard.press('Escape'); await sleep(700)
    }
    ok(`${W}: no page errors`, errs.length === 0, errs.join(' | '))
    await c.close()
  }
  console.log(`${n0 - bad}/${n0} passed`); await b.close(); process.exit(bad ? 1 : 0)
})()
