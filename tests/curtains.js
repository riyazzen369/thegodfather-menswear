/* The entrance: no gate, no "touch the crest". The curtains are in the HTML itself, part by themselves
   and the storefront greets the visitor. Run: bash tests/run.sh curtains.js */
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8795/';
const { ARGS } = require('./gl');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (n, p, i = '') => { if (!p) fails++; console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
(async () => {
  const b = await chromium.launch({ args: ARGS });
  const ctx = await b.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const html = await (await fetch(URL)).text();
  ok('curtains are in the HTML itself (painted before any script)', /id="curtains"/.test(html) && /curtain-tall\.webp/.test(html));
  ok('no gate and no "touch the crest" in the page', !/boot-gate|crest-btn|Touch the crest/.test(html));
  await p.goto(URL, { waitUntil: 'commit' });
  await p.waitForSelector('#curtains .cur.l'); await sleep(200);
  ok('first visit: curtains cover the screen at first', await p.evaluate(() => { const r = document.querySelector('#curtains .cur.l').getBoundingClientRect(); return r.width > 150 && !document.querySelector('#crest'); }));
  await p.waitForSelector('.tailor', { timeout: 20000 });
  await p.waitForFunction(() => !document.getElementById('curtains'), null, { timeout: 8000 });
  ok('curtains open by themselves and are removed', true);
  await p.waitForSelector('.tailor.typed', { timeout: 30000 });
  ok('Lorenzo greets and both choices show (no tap needed to get here)', await p.evaluate(() => !!document.querySelector('#choice-premium') && !!document.querySelector('#choice-tour') && !document.querySelector('#gate')));
  ok('no script errors', errs.length === 0, errs.join(' | '));
  await p.locator('#choice-tour').tap(); await p.waitForSelector('#grid', { timeout: 15000 }); await sleep(500);
  await p.locator('#home').tap(); await sleep(900);
  ok('logo replays the entrance (curtains return)', await p.evaluate(() => !!document.querySelector('.curtains')));
  await p.reload({ waitUntil: 'load' }); await sleep(300);
  ok('returning visit in the same session skips the curtains', await p.evaluate(() => !document.getElementById('curtains') || getComputedStyle(document.getElementById('curtains')).display === 'none'));
  // a tap skips the curtains at once
  const c2 = await b.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true }); const q = await c2.newPage();
  await q.goto(URL, { waitUntil: 'commit' }); await q.waitForSelector('#curtains'); await q.touchscreen.tap(200, 400); await sleep(300);
  ok('a tap skips the curtains', await q.evaluate(() => !document.getElementById('curtains')));
  // reduced motion: no curtains at all
  const c3 = await b.newContext({ viewport: { width: 412, height: 823 }, reducedMotion: 'reduce' }); const r = await c3.newPage();
  await r.goto(URL, { waitUntil: 'load' }); await sleep(300);
  ok('reduced motion: no curtain animation', await r.evaluate(() => { const c = document.getElementById('curtains'); return !c || getComputedStyle(c).display === 'none'; }));
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
