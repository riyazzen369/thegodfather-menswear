/* Cart and checkout end to end (no database: the order goes to WhatsApp). Usage: GL=sw bash tests/run.sh checkout.js */
const { chromium } = require('playwright'); const { ARGS } = require('./gl')
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
;(async () => {
  const b = await chromium.launch({ args: ARGS }); const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage()
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  let popup = ''; await c.route('https://wa.me/**', r => { popup = r.request().url(); r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }) })
  await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(() => { sessionStorage.setItem('gf-entered', '1'); sessionStorage.setItem('gf-peek', '1'); localStorage.removeItem('gf-cart') }); await p.reload(); await sleep(4500)
  await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium').click(); await sleep(2500); await p.locator('#walk-skip').click({ timeout: 4000 }).catch(() => {}); await sleep(9000)
  // add two sizes of the first piece
  await p.locator('.slide.is-active .size-row .chip:not([disabled])').nth(1).click(); await p.locator('.slide.is-active #add-cart').click(); await sleep(800)
  ok(await p.locator('#cart').isVisible(), 'cart opens after Add to cart'); ok(/Your cart \(1\)/.test(await p.locator('#cart-title').innerText()), 'cart shows 1 item')
  await p.locator('#cart-close').click(); await sleep(500); ok(await p.locator('#cart-fab').count() === 1, 'floating cart button appears')
  await p.locator('#cart-fab').click(); await sleep(500)
  await p.locator('#cart [aria-label="More"], #cart button:has-text("+")').first().click().catch(() => {}); await sleep(300)
  await p.locator('#checkout-go').click(); await sleep(500)
  // validation messages
  await p.locator('#place-order').click(); await sleep(300); ok(/name/i.test(await p.locator('#cart [role=alert]').innerText()), 'empty name is refused with a message')
  await p.fill('#co-name', 'Test Buyer'); await p.fill('#co-phone', '98765'); await p.locator('#place-order').click(); await sleep(300); ok(/mobile/i.test(await p.locator('#cart [role=alert]').innerText()), 'short phone is refused')
  await p.fill('#co-phone', '9876543210'); await p.fill('#co-address', 'short'); await p.locator('#place-order').click(); await sleep(300); ok(/address/i.test(await p.locator('#cart [role=alert]').innerText()), 'short address is refused')
  await p.fill('#co-address', '12 Test Street, Chennai'); await p.fill('#co-pincode', '60'); await p.locator('#place-order').click(); await sleep(300); ok(/pincode/i.test(await p.locator('#cart [role=alert]').innerText()), 'bad pincode is refused')
  await p.fill('#co-pincode', '600001')
  const [pop] = await Promise.all([c.waitForEvent('page', { timeout: 8000 }).catch(() => null), p.locator('#place-order').click()]); await sleep(1500)
  ok(/Order placed/i.test(await p.locator('#cart-title').innerText()), 'order is placed (confirmation step)')
  ok(!!pop || !!popup, 'the WhatsApp order message opens'); const u = decodeURIComponent((pop ? pop.url() : popup) || ''); ok(/Test Buyer/.test(u) && /600001/.test(u) && /Cash on delivery/.test(u), 'the message carries the name, pincode and payment')
  await p.locator('#cart-close').click(); await sleep(500); ok(await p.locator('#cart-fab').count() === 0, 'cart is empty after the order')
  ok(errs.length === 0, 'no script errors' + (errs.length ? ' -> ' + [...new Set(errs)].slice(0, 3).join(' | ') : ''))
  await b.close(); process.exit(fails ? 1 : 0) })()
