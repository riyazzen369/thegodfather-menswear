/* Whole-site flow in real 3D (software GL): navigation, movement, screenshots + error/overflow checks. Usage: GL=sw bash tests/run.sh flow3d.js */
const { chromium } = require('playwright'); const { ARGS } = require('./gl'); const fs = require('fs'); const path = require('path')
const sleep = ms => new Promise(r => setTimeout(r, ms)); const OUT = path.join(__dirname, 'out', 'flow'); fs.mkdirSync(OUT, { recursive: true })
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
async function run(name, vp, mobile) {
  const b = await chromium.launch({ args: ARGS }); const c = await b.newContext({ viewport: vp, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 }); const p = await c.newPage()
  const errs = [], bad = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) }); p.on('requestfailed', r => bad.push(r.url().slice(-60)))
  const shot = async n => p.screenshot({ path: `${OUT}/${name}-${n}.png` })
  const st = () => p.evaluate(() => ({ view: window.__rig.view, idx: window.__rig.index, p: +window.__rig.scrollP.toFixed(2), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, gl: !!document.querySelector('canvas') }))
  console.log('== ' + name)
  await p.goto('http://localhost:8795/?force3d&q=low'); await sleep(1500); await shot('01-curtains')
  await p.evaluate(() => sessionStorage.setItem('gf-entered', '1')); await p.reload(); await sleep(5000); await shot('02-tailor')
  let s = await st(); ok(s.view === 'tailor', name + ': storefront shows (' + s.view + ')'); ok(s.sw <= s.cw + 1, name + ': no horizontal overflow on storefront')
  await p.keyboard.press('Escape'); await sleep(300)
  for (const id of ['nav-collections', 'nav-visit', 'nav-contacts', 'nav-private']) ok(await p.locator('#' + id).count() === 1, name + ': nav ' + id + ' present')
  // contacts dialog
  if (await p.locator('#nav-contacts').isVisible()) { await p.locator('#nav-contacts').click({ timeout: 4000 }).catch(() => {}); await sleep(600); await shot('03-contacts'); ok(await p.locator('#contact-wa').isVisible(), name + ': contacts dialog opens'); await p.keyboard.press('Escape'); await sleep(500) } else console.log('  (nav hidden at this width: ' + name + ')')
  // premium walk -> vault
  await p.locator('#choice-premium').click(); await sleep(1000); await shot('04-walk-a'); s = await st(); ok(s.view === 'walk' || s.view === 'transition', name + ': premium walk starts (' + s.view + ')')
  await sleep(1500); await shot('05-walk-b'); await p.waitForFunction(() => window.__rig.view === 'wardrobe', null, { timeout: 20000 }).catch(() => {}); await sleep(5000); await shot('06-vault'); s = await st(); ok(s.view === 'wardrobe', name + ': arrives in the vault (' + s.view + ')'); ok(s.gl, name + ': 3D canvas mounted')
  // vault movement: next x3, prev x1, with settle checks
  for (let i = 1; i <= 3; i++) { await p.keyboard.press('ArrowRight'); await sleep(2200); s = await st(); ok(s.idx === i && Math.abs(s.p - i) < 0.05, name + `: next -> piece ${i + 1} settled (idx ${s.idx}, p ${s.p})`) ; if (i === 2) await shot('07-vault-3') }
  await p.keyboard.press('ArrowLeft'); await sleep(2200); s = await st(); ok(s.idx === 2, name + ': prev -> idx 2'); ok(s.sw <= s.cw + 1, name + ': no horizontal overflow in vault')
  const vis = await p.evaluate(() => [...document.querySelectorAll('.track .stage')].filter(e => e.style.visibility !== 'hidden' && (e.style.opacity === '' || +e.style.opacity > 0.05) && e.getBoundingClientRect().right > 0 && e.getBoundingClientRect().left < innerWidth).length); ok(vis === 1, name + ': one piece on screen at rest (' + vis + ')')
  // the vault slide itself: description, details and buying options under the piece
  ok(await p.locator('.slide.is-active .specs').count() === 1, name + ': details list is on the vault slide')
  ok(await p.locator('.slide.is-active .size-row .chip').count() >= 4, name + ': sizes are open on the vault slide')
  ok(await p.locator('.slide.is-active a[href*="wa.me"], .slide.is-active .details').count() === 0, name + ': no Enquire / View details under the piece')
  const bb = await p.locator('.slide.is-active .buy-row').boundingBox(); ok(!!bb && bb.y + bb.height <= (vp.height) && bb.y > vp.height * 0.45, name + ': Add to cart / Buy now are pinned inside the screen')
  await shot('07b-vault-buy')
  await p.locator('.slide.is-active #add-cart').click({ timeout: 4000 }).catch(() => {}); await sleep(400)
  ok(/choose a size/i.test(await p.locator('.slide.is-active').innerText()), name + ': Add to cart without a size asks for one')
  await p.locator('.slide.is-active .size-row .chip:not([disabled])').first().click({ timeout: 4000 }).catch(() => {})
  await p.locator('.slide.is-active #add-cart').click({ timeout: 4000 }).catch(() => {}); await sleep(1200); await shot('07c-vault-cart')
  ok(await p.evaluate(() => { const c = document.querySelector('#cart'); if (!c) return false; const r = c.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && c.contains(e) }), name + ': cart opens above the vault')
  await p.locator('#cart-close').click({ timeout: 4000 }).catch(() => {}); await sleep(800)
  // tap the piece -> inspect 3D
  const g = p.locator('.slide.is-active .garment').first(); await g.click({ timeout: 3000 }).catch(() => {}); await sleep(3500); await shot('09-inspect'); const insp = await p.locator('#inspect.open').count(); ok(insp === 1, name + ': tap opens 3D inspect')
  if (insp) {
    ok(await p.locator('#inspect #add-cart, #inspect #buy-now, #inspect .size-row, #inspect-wa, #inspect-flip, #inspect-details').count() === 0, name + ': inspect has no buying options, Enquire, Show back or details button')
    ok(/Animal-print|\S/.test(await p.locator('#inspect-title').innerText()), name + ': inspect shows the name')
    await p.keyboard.press('ArrowRight'); await sleep(1500); await shot('10-inspect-back'); await p.locator('#inspect-close').click({ timeout: 4000 }).catch(() => {}); await sleep(1500); s = await st(); ok(s.view === 'wardrobe', name + ': inspect closes back to vault') }
  // back to storefront, then grid
  await p.locator(mobile ? '#ask' : '#back-shop').click({ timeout: 4000 }).catch(() => {}); await sleep(3000); s = await st(); ok(s.view === 'tailor', name + ': back to storefront (' + s.view + ')'); await shot('11-back-tailor')
  await p.locator('#nav-collections').click({ timeout: 4000 }).catch(async () => { await p.evaluate(() => document.getElementById('nav-collections').click()) }); await sleep(3000); s = await st(); await shot('12-collections'); ok(s.view === 'grid', name + ': collections grid (' + s.view + ')'); ok(s.sw <= s.cw + 1, name + ': no horizontal overflow in grid')
  await p.locator('.card').first().click({ timeout: 4000 }).catch(() => {}); await sleep(2000); await shot('13-grid-sheet'); if (await p.locator('.card').count()) ok(await p.locator('#sheet').count() >= 1, name + ': grid card opens sheet'); else console.log('  (no products in the no-database test build: card check skipped)')
  await p.keyboard.press('Escape'); await sleep(800)
  // cart
  await p.locator('#cart-fab').click({ timeout: 3000 }).catch(() => {}); await sleep(1000); await shot('14-cart')
  await p.keyboard.press('Escape'); await sleep(500)
  ok(errs.length === 0, name + ': no script/console errors' + (errs.length ? ' -> ' + [...new Set(errs)].slice(0, 5).join(' | ') : ''))
  if (bad.length) console.log('  failed requests:', [...new Set(bad)].slice(0, 5).join(', '))
  await b.close()
}
(async () => { await run('mobile', { width: 390, height: 844 }, true); await run('desktop', { width: 1366, height: 768 }, false); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0) })()
