/* The rail's position over time for one swipe: eases in and out (no jolt at the start, no overshoot, settles in about a second). */
const { chromium } = require('playwright'); const { ARGS } = require('./gl')
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
;(async () => {
  const b = await chromium.launch({ args: ARGS }); const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage()
  await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(() => { sessionStorage.setItem('gf-entered', '1'); sessionStorage.setItem('gf-peek', '1') }); await p.reload(); await sleep(5000)
  await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium').click(); await sleep(2500); await p.locator('#walk-skip').click({ timeout: 4000 }).catch(() => {}); await sleep(10000)
  await p.evaluate(() => { window.__tr = []; const t0 = performance.now(); const f = () => { window.__tr.push([performance.now() - t0, window.__rig.scrollP]); if (performance.now() - t0 < 2500) requestAnimationFrame(f) }; requestAnimationFrame(f) })
  await sleep(100); await p.keyboard.press('ArrowRight'); await sleep(2600)
  const tr = await p.evaluate(() => window.__tr); await b.close()
  const t0 = tr.find(([, v]) => v > 0.001)?.[0] ?? 0, pts = tr.filter(([t]) => t >= t0 - 20).map(([t, v]) => [(t - t0) / 1000, v])
  const at = s => { const q = pts.find(([t]) => t >= s); return q ? q[1] : 1 }
  console.log('p at 0.1/0.25/0.5/0.75/1.0/1.5 s:', [0.1, 0.25, 0.5, 0.75, 1, 1.5].map(s => at(s).toFixed(3)).join(' '))
  ok(at(0.25) < 0.8, 'eases in (p at 0.25 s = ' + at(0.25).toFixed(3) + '; frames here are ~90 ms apart, so the first 0.1 s is not resolvable)'); ok(Math.max(...pts.map(([, v]) => v)) < 1.005, 'no overshoot'); ok(at(0.75) > 0.85 && at(1.5) > 0.995, 'settled by about a second and a half')
  process.exit(fails ? 1 : 0) })()
