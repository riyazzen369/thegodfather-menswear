// Real-GPU run on Zeus: Brave, headed, GPU on. Per-scene fps from a rAF sampler, quality level, 2D fallback, errors, screenshots.
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = process.env.URL || 'https://riyazzen369.github.io/thegodfather-menswear/';
const TAG = process.env.TAG || 'before';
const OUT = path.join(__dirname, 'out-' + TAG); fs.mkdirSync(OUT, { recursive: true });
const BRAVE = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const SAMPLER = `(() => { const t = []; window.__ft = t; window.__gaps = []; const f = n => { t.push(n); requestAnimationFrame(f) }; requestAnimationFrame(f) })()`;
async function scene(p, name, fn, res) {
  await p.bringToFront()
  const a = await p.evaluate(() => window.__ft.length)
  await fn()
  const s = await p.evaluate(a => {
    const t = window.__ft.slice(a); if (t.length < 3) return null
    /* frames that overlap a screenshot are excluded (capturing stalls the page; it isn't the site) */
    const gaps = window.__gaps, inGap = (x, y) => gaps.some(([s, e]) => x < e + 20 && y > s - 20)
    const d = []; let skip = 0; for (let i = 1; i < t.length; i++) { if (inGap(t[i - 1], t[i])) { skip += t[i] - t[i - 1]; continue } d.push(t[i] - t[i - 1]) }
    const dur = t[t.length - 1] - t[0] - skip
    let min = 999; for (let w = t[0]; w + 1000 <= t[t.length - 1]; w += 250) { if (inGap(w, w + 1000)) continue; const n = t.filter(x => x >= w && x < w + 1000).length; min = Math.min(min, n) }
    const sorted = [...d].sort((x, y) => x - y)
    const r = window.__rig || {}
    return { frames: d.length, sec: +(dur / 1000).toFixed(1), avg: +(d.length * 1000 / dur).toFixed(1), min1s: min === 999 ? null : min,
      p95ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1), maxms: +sorted[sorted.length - 1].toFixed(1), long50: d.filter(x => x > 50).length,
      quality: r.quality, low: r.low, dpr: r.dpr, mode: /is3d/.test(document.querySelector('.app').className) ? '3d' : '2d',
      overlay: (document.querySelector('.fps-debug') || {}).textContent || '' }
  }, a)
  res.scenes.push({ name, ...s }); console.log(res.vp, name, JSON.stringify(s))
}
(async () => {
  const b = await chromium.launch({ executablePath: BRAVE, headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', '--window-position=0,0', '--window-size=1480,1000'] })
  const all = []
  const VPS = (process.env.VPS || '1440x900,390x844').split(',')
  for (const [vp, opts] of [['1440x900', { viewport: { width: 1440, height: 900 } }], ['390x844', process.env.TOUCH ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 }]]) {
    if (!VPS.includes(vp)) continue
    const mob = vp.startsWith('390'), res = { vp, scenes: [], errors: [], pieces: [] }; all.push(res)
    const c = await b.newContext(opts); await c.addInitScript(SAMPLER)
    const p = await c.newPage()
    p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /godfather|WebGL|context/i.test(m.text()))) res.errors.push(m.type() + ': ' + m.text().slice(0, 240)) })
    p.on('pageerror', e => res.errors.push('pageerror: ' + e.message))
    const gap = async f => { const s0 = await p.evaluate(() => performance.now()); await f(); await p.evaluate(s0 => window.__gaps.push([s0, performance.now()]), s0) }
    const shot = n => process.env.NOSHOT ? Promise.resolve() : gap(() => p.screenshot({ path: path.join(OUT, `zeus-${TAG}-${mob ? 'mobile' : 'desktop'}-${n}.png`) }))
    const touch = mob && !!process.env.TOUCH
    const tap = async sel => touch ? p.locator(sel).tap() : p.locator(sel).click()
    await p.goto(URL + '?debug=fps', { waitUntil: 'load' })
    res.renderer = await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'none' })
    await scene(p, 'gate', () => sleep(4000), res); await shot('01-gate')
    await scene(p, 'entry', async () => { await tap('#crest'); await sleep(2600) }, res)
    await p.waitForSelector('#tailor', { timeout: 8000 })
    await scene(p, 'storefront+Lorenzo', async () => { await sleep(1500); await shot('02-storefront'); await p.waitForSelector('.tailor.typed', { timeout: 15000 }); await sleep(1500) }, res)
    await shot('03-lorenzo-choices')
    await scene(p, 'walk: shop+wardrobe (0-5.8s)', async () => { await tap('#choice-premium'); await sleep(1800); await shot('04-walk-shop'); await sleep(1700); await shot('05-walk-wardrobe'); await sleep(2300) }, res)
    await scene(p, 'walk: stairs+bunker (5.8-10s)', async () => { await sleep(1400); await shot('06-walk-stairs'); await sleep(1600); await shot('07-bunker-descent'); await sleep(1200) }, res)
    await scene(p, 'walk: unlock + doors open (10-13s)', async () => { await sleep(500); await shot('07b-lorenzo-key'); await sleep(1100); await shot('07c-wardrobe-opening'); await sleep(1400) }, res)
    await sleep(600)
    await scene(p, 'vault: 12 pieces', async () => {
      for (let i = 0; i < 12; i++) {
        if (i > 0) { if (touch) { const cdp = await c.newCDPSession(p); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y: 420 }] }); for (let k = 1; k <= 8; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 320 - k * 28, y: 420 }] }); await sleep(20) } await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach() } else await p.keyboard.press('ArrowRight'); await sleep(1700) }
        const g = await p.evaluate(() => { const a = document.querySelector('.slide.is-active .garment'); if (!a) return null; const im = a.querySelector('img'); const r = a.getBoundingClientRect(); return { i: +a.closest('.slide').dataset.i, x: r.left, y: r.top, w: r.width, h: r.height, loaded: !!im && im.complete && im.naturalWidth > 0, src: im ? im.currentSrc.split('/').pop() : '' } })
        if (!g) { res.pieces.push({ want: i, missing: true }); continue }
        const file = `zeus-${TAG}-${mob ? 'mobile' : 'desktop'}-piece-${String(i + 1).padStart(2, '0')}.png`
        if (!process.env.NOSHOT) await gap(() => p.screenshot({ path: path.join(OUT, file), clip: { x: Math.min(opts.viewport.width - 20, Math.max(0, g.x + g.w * 0.25)), y: Math.max(0, g.y + g.h * 0.15), width: Math.max(10, g.w * 0.5), height: Math.max(10, g.h * 0.7) } }))
        if (i === 0) await shot('08-vault-piece1')
        if (i === 1) await shot('09-vault-piece2')
        res.pieces.push({ want: i, ...g, file })
      }
    }, res)
    await scene(p, 'attire tour + detail sheet', async () => {
      await tap('#ask'); await p.waitForSelector('#choice-tour', { timeout: 10000 }); await sleep(600); await p.keyboard.press('Escape'); await sleep(400)
      await tap('#choice-tour'); await sleep(1600); await shot('10-attire-tour')
      await p.evaluate(() => document.querySelector('#grid').scrollBy({ top: 900, behavior: 'smooth' })); await sleep(1200)
      await tap('#grid .card[data-i="4"]'); await sleep(1300); await shot('11-detail-sheet'); await p.keyboard.press('Escape'); await sleep(700)
    }, res)
    res.final = await p.evaluate(() => ({ mode: document.querySelector('.app').className, health: window.__glHealth || null, quality: (window.__rig || {}).quality, low: (window.__rig || {}).low }))
    await c.close()
  }
  fs.writeFileSync(path.join(OUT, `zeus-${TAG}-${VPS.join('_')}.json`), JSON.stringify(all, null, 1))
  await b.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) });
