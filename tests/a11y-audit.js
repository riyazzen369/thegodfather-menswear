/* Quick accessibility audit of every screen: names, duplicate ids, focusable-but-hidden controls, image alts, form labels. */
const { chromium } = require('playwright'); const { ARGS } = require('./gl'); const sleep = ms => new Promise(r => setTimeout(r, ms))
const audit = () => {
  const out = []; const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' }
  const name = e => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.textContent || e.textContent || e.getAttribute('title') || e.getAttribute('alt') || '').trim()
  document.querySelectorAll('button,a[href],[role=button],[role=radio]').forEach(e => { if (vis(e) && !name(e) && !e.querySelector('img[alt]:not([alt=""])')) out.push('no name: ' + (e.id || e.className || e.tagName)) })
  document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(e => { if (vis(e) && !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')) out.push('input without label: ' + (e.id || e.name || e.type)) })
  document.querySelectorAll('img').forEach(e => { if (!e.hasAttribute('alt')) out.push('img without alt attribute: ' + (e.src || '').split('/').pop()) })
  const ids = {}; document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1 }); Object.entries(ids).filter(([, n]) => n > 1).forEach(([i, n]) => out.push(`duplicate id ${i} x${n}`))
  document.querySelectorAll('[aria-hidden="true"] a[href],[aria-hidden="true"] button:not([tabindex="-1"]),[aria-hidden="true"] input').forEach(e => { if (!e.closest('[inert]') && e.tabIndex >= 0) out.push('focusable inside aria-hidden: ' + (e.id || e.className || e.textContent.trim().slice(0, 24))) })
  if (document.querySelectorAll('h1').length > 1) out.push('more than one h1')
  if (!document.documentElement.lang) out.push('html lang missing'); if (!document.title) out.push('title missing')
  return [...new Set(out)]
}
;(async () => {
  const b = await chromium.launch({ args: ARGS }); const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage()
  const show = async (n) => { const r = await p.evaluate(audit); console.log((r.length ? 'ISSUES ' : 'CLEAN  ') + n + (r.length ? '\n   - ' + r.join('\n   - ') : '')) }
  await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(() => { sessionStorage.setItem('gf-entered', '1'); sessionStorage.setItem('gf-peek', '1') }); await p.reload(); await sleep(5500); await show('storefront')
  await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium').click(); await sleep(2500); await p.locator('#walk-skip').click({ timeout: 4000 }).catch(() => {}); await sleep(9000); await show('vault')
  await p.locator('.slide.is-active .size-row .chip:not([disabled])').first().click().catch(() => {}); await p.locator('.slide.is-active #add-cart').click().catch(() => {}); await sleep(800); await show('cart')
  await p.locator('#checkout-go').click().catch(() => {}); await sleep(400); await show('checkout'); await p.locator('#cart-close').click().catch(() => {}); await sleep(500)
  await p.locator('.slide.is-active .garment').click({ force: true }).catch(() => {}); await sleep(3000); await show('inspect'); await b.close() })()
