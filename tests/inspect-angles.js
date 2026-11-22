// Inspect view at 0/30/60/90° for every ITEM (mobile 390x844 + desktop 1440x900), plus a drag (clamp + spring back).
// Writes a contact sheet per viewport to shots/inspect-<w>.png and prints drag readings.
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = process.env.URL || 'http://localhost:8795/'; const OUT = path.join(__dirname, '..', 'shots'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let bad = 0
  for (const [W, H] of (process.env.VPS || "390x844,1440x900").split(",").map(v => v.split("x").map(Number))) {
    const mob = W < 700, c = await b.newContext({ viewport: { width: W, height: H }, isMobile: mob, hasTouch: mob, deviceScaleFactor: 1 }); const p = await c.newPage()
    const errs = []; p.on('pageerror', e => errs.push(e.message))
    await p.goto(URL + '?force3d&q=low'); await p.evaluate(() => sessionStorage.setItem('gf-entered', '1')); await p.reload(); await sleep(4500)
    await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium').click({ force: true }); await sleep(1200); await p.keyboard.press('Escape'); await sleep(3000)
    const n = await p.evaluate(() => document.querySelectorAll('.slide[data-i]').length) - 1 // last slide is the private-visit panel
    const tiles = []
    for (let i = +(process.env.FROM || 0); i < (process.env.ONLY ? +process.env.ONLY + 1 : n); i++) {
      await p.evaluate(i => window.__rig && document.querySelectorAll('.slide')[i], i)
      for (let k = 0; k < 20 && await p.evaluate(() => window.__rig.index) !== i; k++) { await p.keyboard.press(await p.evaluate(() => window.__rig.index) < i ? 'ArrowRight' : 'ArrowLeft'); await sleep(700) }
      await p.waitForFunction(() => { const r = window.__rig; return Math.abs(r.scrollP - Math.round(r.scrollP)) < 0.002 }, null, { timeout: 15000 })
      await p.locator('.slide.is-active .details').click({ force: true }); await p.waitForSelector('.inspect.ready', { timeout: 15000 }); await sleep(900)
      for (const deg of [0, 30, 60, 90]) {
        await p.evaluate(d => window.__inspectYaw(d), deg); await sleep(450)
        const f = path.join(OUT, `insp-${W}-${i}-${deg}.png`); await p.locator('.inspect-stage').screenshot({ path: f }); tiles.push(f)
      }
      await p.evaluate(() => window.__inspectYaw(null))
      if (i === 0 || i === n - 1) { // drag: mouse/touch 60% of the width, read the angle while held and after release
        const box = await p.locator('.inspect-stage').boundingBox(), y = box.y + box.height * 0.5, x0 = box.x + box.width * 0.3
        if (mob) { const cdp = await c.newCDPSession(p); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] }); for (let s = 1; s <= 10; s++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + W * 0.06 * s, y }] }); await sleep(30) } await sleep(600); var held = await p.evaluate(() => window.__inspectTurn()); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
        else { await p.mouse.move(x0, y); await p.mouse.down(); for (let s = 1; s <= 10; s++) { await p.mouse.move(x0 + W * 0.06 * s, y); await sleep(30) } await sleep(600); var held = await p.evaluate(() => window.__inspectTurn()); await p.mouse.up() }
        await sleep(2500); const after = await p.evaluate(() => window.__inspectTurn())
        const ok = held > 20 && held < 52 && Math.abs(after) < 9; if (!ok) bad++
        console.log(`${ok ? 'PASS' : 'FAIL'} ${W} item ${i} drag: held ${held.toFixed(1)}°, after release ${after.toFixed(1)}°`)
      }
      await p.keyboard.press('Escape'); await sleep(700)
    }
    // contact sheet: rows = items, cols = 0/30/60/90
    const sheet = path.join(OUT, `inspect-${W}.png`)
    const py = `from PIL import Image\nimport sys\nfs=sys.argv[2:];im=[Image.open(f).convert('RGB') for f in fs];w=200;h=int(im[0].height*w/im[0].width)\nS=Image.new('RGB',(w*4,h*(len(im)//4)),'black')\nfor k,t in enumerate(im): S.paste(t.resize((w,h)),((k%4)*w,(k//4)*h))\nS.save(sys.argv[1])`
    require('child_process').execFileSync('python3', ['-c', py, sheet, ...tiles]); if (!process.env.KEEP) tiles.forEach(f => fs.unlinkSync(f))
    console.log(`${errs.length ? 'FAIL' : 'PASS'} ${W}: ${n} items × 4 angles, page errors: ${errs.length} ${errs.join(' | ')}`); if (errs.length) bad++
    await c.close()
  }
  await b.close(); process.exit(bad ? 1 : 0)
})()
