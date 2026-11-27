/* Frame-time spikes while the storefront intro plays and when the premium walk starts (software GL: only the relative picture matters). */
const { chromium } = require('playwright'); const { ARGS } = require('./gl')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await chromium.launch({ args: ARGS }); const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage()
  await p.addInitScript(() => { window.__ft = []; window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ entryTypes: ['longtask'] }) } catch (e) {}
    let last = performance.now(); const f = t => { window.__ft.push([Math.round(t), Math.round(t - last)]); last = t; requestAnimationFrame(f) }; requestAnimationFrame(f) })
  await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(() => sessionStorage.setItem('gf-entered', '1')); await p.reload(); await sleep(7000)
  const t0 = await p.evaluate(() => Math.round(performance.now())); await p.keyboard.press('Escape'); await sleep(300)
  await p.locator('#choice-premium').click(); const tc = await p.evaluate(() => Math.round(performance.now())); await sleep(9000)
  const r = await p.evaluate(() => ({ ft: window.__ft, lt: window.__lt }))
  const seg = (a, z) => r.ft.filter(([t]) => t >= a && t < z).map(([, d]) => d)
  const stat = (name, a) => { const s = a.slice().sort((x, y) => x - y); console.log(name.padEnd(18), 'frames', String(a.length).padStart(4), 'median', s[s.length >> 1], 'p95', s[Math.floor(s.length * 0.95)], 'max', s[s.length - 1], 'over100ms', a.filter(x => x > 100).length) }
  stat('storefront idle', seg(t0 - 4000, t0)); stat('walk (first 3 s)', seg(tc, tc + 3000)); stat('walk (3-9 s)', seg(tc + 3000, tc + 9000))
  console.log('longtasks before click:', JSON.stringify(r.lt.filter(([t]) => t < tc).slice(-12)), ' during first 3s of walk:', JSON.stringify(r.lt.filter(([t]) => t >= tc && t < tc + 3000)))
  await b.close() })()
