/* Responsive sweep: every screen at 5 widths. Checks horizontal overflow, console errors, clipped buy bar, tiny tap targets. */
const { chromium } = require('playwright'); const { ARGS } = require('./gl'); const fs = require('fs'); const path = require('path')
const OUT = path.join(__dirname, 'out', 'sweep'); fs.mkdirSync(OUT, { recursive: true }); const sleep = ms => new Promise(r => setTimeout(r, ms))
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const SIZES = [[320, 568], [375, 667], [414, 896], [768, 1024], [1440, 900]]
;(async () => {
  for (const [w, h] of SIZES) {
    const b = await chromium.launch({ args: ARGS }); const mobile = w < 900; const c = await b.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile }); const p = await c.newPage()
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
    const ov = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    const tiny = () => p.evaluate(() => [...document.querySelectorAll('button,a.btn,a[href],input,select')].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0' && (r.height < 30 || r.width < 30) && !e.closest('[inert]') && !e.closest('.sr-only') && e.offsetParent }).map(e => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).slice(0, 6))
    await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(() => { sessionStorage.setItem('gf-entered', '1'); sessionStorage.setItem('gf-peek', '1') }); await p.reload(); await sleep(4500)
    await p.keyboard.press('Escape'); await sleep(300)
    ok((await ov()) <= 1, `${w}: storefront no horizontal overflow (${await ov()})`); await p.screenshot({ path: `${OUT}/${w}-1-store.png` })
    const t1 = await tiny(); if (t1.length) console.log(`  ${w} small targets (storefront):`, t1.join(' '))
    await p.locator('#choice-premium').click(); await sleep(2500); await p.locator('#walk-skip').click({ timeout: 4000 }).catch(() => {}); await sleep(9000)
    ok((await ov()) <= 1, `${w}: vault no horizontal overflow (${await ov()})`)
    const bar = await p.locator('.slide.is-active .buy-row').boundingBox().catch(() => null)
    ok(!!bar && bar.y >= 0 && bar.y + bar.height <= h + 1, `${w}: buy bar inside the screen (${bar ? Math.round(bar.y) + '+' + Math.round(bar.height) + ' of ' + h : 'missing'})`)
    const stg = await p.locator('.slide.is-active .stage').boundingBox(); ok(stg.height > h * 0.3, `${w}: piece area is a decent size (${Math.round(stg.height)}px of ${h})`)
    await p.screenshot({ path: `${OUT}/${w}-2-vault.png` }); const t2 = await tiny(); if (t2.length) console.log(`  ${w} small targets (vault):`, t2.join(' '))
    await p.locator('.slide.is-active .garment').click({ force: true, timeout: 4000 }).catch(() => {}); await sleep(3500)
    ok((await ov()) <= 1, `${w}: inspect no horizontal overflow`); await p.screenshot({ path: `${OUT}/${w}-3-inspect.png` })
    const ib = await p.locator('#inspect .flip-card').boundingBox().catch(() => null); ok(!!ib && ib.height > h * 0.4, `${w}: flip piece is large (${ib ? Math.round(ib.height) : 0}px of ${h})`)
    await p.locator('#inspect-close').click({ timeout: 4000 }).catch(() => {}); await sleep(1200)
    await p.locator('.slide.is-active .size-row .chip:not([disabled])').first().click().catch(() => {}); await p.locator('.slide.is-active #add-cart').click().catch(() => {}); await sleep(800)
    ok((await ov()) <= 1, `${w}: cart no horizontal overflow`); await p.screenshot({ path: `${OUT}/${w}-4-cart.png` })
    await p.locator('#checkout-go').click().catch(() => {}); await sleep(500); ok((await ov()) <= 1, `${w}: checkout no horizontal overflow`); await p.screenshot({ path: `${OUT}/${w}-5-checkout.png` })
    ok(errs.length === 0, `${w}: no script errors` + (errs.length ? ' -> ' + [...new Set(errs)].slice(0, 3).join(' | ') : ''))
    await b.close()
  }
  process.exit(fails ? 1 : 0) })()
