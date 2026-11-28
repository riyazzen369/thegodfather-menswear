/* Other ways visitors meet the site: reduced motion, no WebGL (2D room), phone in landscape. Each reaches the vault, swipes, inspects, buys. */
const { chromium } = require('playwright'); const { ARGS } = require('./gl'); const sleep = ms => new Promise(r => setTimeout(r, ms))
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const MODES = [
  ['reduced-motion', { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }, ARGS, '?force3d&q=low'],
  ['no-webgl (2D room)', { viewport: { width: 390, height: 844 } }, ['--disable-gpu', '--disable-3d-apis', '--disable-webgl', '--disable-webgl2'], ''],
  ['landscape phone', { viewport: { width: 844, height: 390 } }, ARGS, '?force3d&q=low']
]
;(async () => {
  for (const [name, opt, args, qs] of MODES) {
    const b = await chromium.launch({ args }); const c = await b.newContext({ ...opt, hasTouch: true, isMobile: opt.viewport.width < 900 || name.startsWith('landscape') }); const p = await c.newPage()
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/WebGL|GL context|webgl/i.test(m.text())) errs.push(m.text()) })
    console.log('== ' + name)
    await p.goto('http://localhost:8795/' + qs); await p.evaluate(() => { sessionStorage.setItem('gf-entered', '1'); sessionStorage.setItem('gf-peek', '1') }); await p.reload(); await sleep(5500)
    await p.keyboard.press('Escape'); await sleep(300)
    ok(await p.locator('#choice-premium').isVisible(), name + ': storefront choices visible')
    await p.locator('#choice-premium').click(); await sleep(3000); await p.locator('#walk-skip').click({ timeout: 2000 }).catch(() => {}); await sleep(9000)
    const s = () => p.evaluate(() => ({ view: window.__rig.view, idx: window.__rig.index, p: +window.__rig.scrollP.toFixed(2), ov: document.documentElement.scrollWidth - document.documentElement.clientWidth, canvas: !!document.querySelector('canvas') }))
    let st = await s(); ok(st.view === 'wardrobe', name + ': reaches the vault (' + st.view + ', canvas ' + st.canvas + ')'); ok(st.ov <= 1, name + ': no horizontal overflow')
    await p.keyboard.press('ArrowRight'); await sleep(2500); st = await s(); ok(st.idx === 1, name + ': next piece (idx ' + st.idx + ')')
    await p.keyboard.press('ArrowLeft'); await sleep(2500); st = await s(); ok(st.idx === 0, name + ': previous piece')
    const bar = await p.locator('.slide.is-active .buy-row').boundingBox().catch(() => null); ok(!!bar && bar.y + bar.height <= opt.viewport.height + 1 && bar.y >= 0, name + ': buy bar is on screen' + (bar ? ` (${Math.round(bar.y)}+${Math.round(bar.height)} of ${opt.viewport.height})` : ''))
    const stage = await p.locator('.slide.is-active .stage').boundingBox(); ok(stage.height > opt.viewport.height * 0.28, name + ': piece area is usable (' + Math.round(stage.height) + 'px of ' + opt.viewport.height + ')')
    await p.screenshot({ path: `tests/out/mode-${name.split(' ')[0]}-vault.png` })
    await p.locator('.slide.is-active .garment').click({ force: true, timeout: 4000 }).catch(() => {}); await sleep(2500); ok(await p.locator('#inspect.open').count() === 1, name + ': tap opens the flip view')
    await p.screenshot({ path: `tests/out/mode-${name.split(' ')[0]}-inspect.png` })
    await p.keyboard.press('Escape'); await sleep(1200); ok(await p.locator('#inspect').count() === 0, name + ': Escape closes the flip view')
    await p.locator('.slide.is-active .size-row .chip:not([disabled])').first().click({ timeout: 4000 }).catch(() => {}); await p.locator('.slide.is-active #add-cart').click({ timeout: 4000 }).catch(() => {}); await sleep(700)
    ok(await p.locator('#cart').isVisible().catch(() => false), name + ': Add to cart opens the cart'); await p.keyboard.press('Escape'); await sleep(500)
    ok(errs.length === 0, name + ': no script errors' + (errs.length ? ' -> ' + [...new Set(errs)].slice(0, 3).join(' | ') : ''))
    await b.close()
  }
  process.exit(fails ? 1 : 0) })()
