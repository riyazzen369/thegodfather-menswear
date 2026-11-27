/* JS profile of a vault swipe (the GPU work runs in another process, so the main thread profile is meaningful even on software GL). */
const { chromium } = require('playwright'); const { ARGS } = require('./gl')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await chromium.launch({ args: ARGS }); const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage()
  await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(() => { sessionStorage.setItem('gf-entered', '1'); sessionStorage.setItem('gf-peek', '1') }); await p.reload(); await sleep(5000)
  await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium').click(); await sleep(2500); await p.locator('#walk-skip').click({ timeout: 4000 }).catch(() => {}); await sleep(10000)
  const cdp = await c.newCDPSession(p); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
  await p.evaluate(() => { window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }) })
  await cdp.send('Profiler.start')
  for (let i = 0; i < 3; i++) { await p.keyboard.press('ArrowRight'); await sleep(1600) }
  const { profile } = await cdp.send('Profiler.stop')
  const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n])); const dt = profile.timeDeltas; let tot = 0
  profile.samples.forEach((id, i) => { const n = byId.get(id), cf = n.callFrame, k = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').pop() + ':' + cf.lineNumber; self.set(k, (self.get(k) || 0) + dt[i] / 1000); tot += dt[i] / 1000 })
  console.log('total sampled ms', tot.toFixed(0)); console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => v.toFixed(0).padStart(6) + ' ms  ' + k).join('\n'))
  console.log('longtasks', JSON.stringify(await p.evaluate(() => window.__lt)))
  await b.close() })()
