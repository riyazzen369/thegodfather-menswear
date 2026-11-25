/* Admin tabs against a mocked Supabase: Elite 12 slots (drag + arrows + caps), Attire list, Orders paid, Sales & payments numbers.
   Builds its own copy with mock env into dist-live/.  node tests/admin-tabs.js */
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SH = path.join(ROOT, 'shots') + '/'; fs.mkdirSync(SH, { recursive: true });
const MOCK = 'https://mockref.supabase.co', ANON = 'anon-test-key', PORT = 8798, URL = `http://localhost:${PORT}/`;
const { ARGS, assertGL } = require('./gl');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (n, c, info = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : '  ' + info}`); if (!c) fails++; };
const base = { category: 'formal', price_from: 50000, tagline: 'T.', description: '', fabric: 'F.', details: { fit: 'x', madeToMeasure: 'x', delivery: 'x' }, colours: [], extra_paths: [], front_cut_path: null, back_path: null, blur: null, sizes: {}, published: true, updated_at: '2026-11-25T00:00:00Z', front_path: 'a/front.webp' };
const P = (slug, name, collection, sort, o = {}) => ({ ...base, id: slug, slug, name, collection, sort, ...o });
let ROWS = [P('e1', 'Elite One', 'premium', 10), P('e2', 'Elite Two', 'premium', 20), P('e3', 'Elite Three', 'premium', 30), P('a1', 'Attire One', 'attire', 10, { category: 'shirts' }), P('a2', 'Attire Two', 'attire', 20, { category: 'shirts', published: false })];
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const ORD = (o) => ({ id: o.ref, name: 'Cust', phone: '+919876543210', address: '12 Road, City', pincode: '560001', utr: null, delivery: '1–2 days', paid_at: null, paid: false, ...o });
let ORDERS = [
  ORD({ ref: 'GF-1', created_at: ago(0.1), payment: 'upi', total: 85000, status: 'confirmed', paid: true, utr: '412345678901', items: [{ name: 'Three-piece suit', size: 'M', qty: 1, price: 85000 }] }),
  ORD({ ref: 'GF-2', created_at: ago(2), payment: 'cod', total: 7980, status: 'delivered', paid: true, items: [{ name: 'Lilac shirt', size: 'L', qty: 2, price: 3990 }] }),
  ORD({ ref: 'GF-3', created_at: ago(1), payment: 'whatsapp', total: 12000, status: 'new', paid: false, items: [{ name: 'Tuxedo', size: 'XL', qty: 1, price: 12000 }] }),
  ORD({ ref: 'GF-4', created_at: ago(3), payment: 'cod', total: 5000, status: 'cancelled', paid: false, items: [{ name: 'Tie', size: 'S', qty: 1, price: 5000 }] })
];
const patches = [];
(async () => {
  execSync('npx vite build --outDir dist-live --emptyOutDir', { cwd: ROOT, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: ANON } });
  const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', 'dist-live', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(URL); break } catch { await sleep(250) } }
  const browser = await chromium.launch({ args: ARGS }); await assertGL(browser);
  const errs = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const jwt = 'e30.' + Buffer.from(JSON.stringify({ sub: 'u1', email: 'o@e.com', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.sig';
    const J = (r, body, st = 200, h = {}) => r.fulfill({ status: st, headers: { ...cors, ...h }, contentType: 'application/json', body: JSON.stringify(body) });
    await ctx.route(`${MOCK}/auth/v1/**`, r => { if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: cors }); if (/grant_type=password/.test(r.request().url())) return J(r, { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'o@e.com' } }); J(r, {}) });
    await ctx.route(`${MOCK}/rest/v1/admins*`, r => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 200, headers: cors }) : J(r, [{ user_id: 'u1' }]));
    await ctx.route(`${MOCK}/rest/v1/products*`, r => {
      const m = r.request().method(); if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: cors });
      if (m === 'PATCH') { const id = new globalThis.URL(r.request().url()).searchParams.get('id').replace('eq.', ''); const b = r.request().postDataJSON(); patches.push({ id, ...b }); ROWS = ROWS.map(x => x.id === id ? { ...x, ...b } : x); return J(r, [], 204 === 0 ? 200 : 200); }
      const q = new globalThis.URL(r.request().url()).searchParams; let out = ROWS.slice().sort((a, b) => a.sort - b.sort);
      return J(r, out);
    });
    await ctx.route(`${MOCK}/rest/v1/orders*`, r => {
      const m = r.request().method(); if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: cors });
      if (m === 'PATCH') { const id = new globalThis.URL(r.request().url()).searchParams.get('id').replace('eq.', ''); const b = r.request().postDataJSON(); patches.push({ order: id, ...b }); ORDERS = ORDERS.map(x => x.id === id ? { ...x, ...b } : x); return J(r, []); }
      J(r, ORDERS.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
    });
    await ctx.route(`${MOCK}/storage/v1/object/**`, r => r.fulfill({ status: 404, headers: cors, body: '' }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/mockref|status of (4|5)\d\d|net::|Failed to load resource/.test(m.text())) errs.push(m.text()) });
    await p.goto(URL + 'admin/', { waitUntil: 'load' }); await p.waitForSelector('#adm-email');
    await p.fill('#adm-email', 'o@e.com'); await p.fill('input[type=password]', 'x'); await p.keyboard.press('Enter');
    await p.waitForSelector('.slot', { timeout: 10000 }); await sleep(500);

    ok('tabs: Elite wardrobe, Attire collection, Orders, Sales & payments', (await p.locator('.adm-tabs button').allTextContents()).join('|') === 'Elite wardrobe|Attire collection|Orders|Sales & payments');
    ok('elite: 12 numbered slots, 3 filled, 9 free', await p.locator('#adm-elite .slot').count() === 12 && await p.locator('#adm-elite .slot:not(.empty)').count() === 3 && await p.locator('#adm-elite .slot.empty').count() === 9);
    ok('elite: counter reads 3 of 12 slots', /3 of 12 slots/.test(await p.textContent('#adm-elite h1')));
    ok('elite: shown as rows (one under another), like the product list', await p.evaluate(() => { const r=[...document.querySelectorAll('#adm-elite .slot:not(.empty)')].map(l=>l.getBoundingClientRect()); return r.length===3 && r[1].top>r[0].bottom-2 && Math.abs(r[0].left-r[1].left)<2 }));
    ok('elite: only elite pieces are in the slots', !(await p.textContent('#adm-elite')).includes('Attire One'));
    const order = () => p.locator('#adm-elite .slot:not(.empty) .slot-name').allTextContents();
    await p.screenshot({ path: SH + 'adm-elite.png', fullPage: true });
    // drag slot 1 onto slot 3
    patches.length = 0;
    await p.dragAndDrop('#adm-elite .slot[data-slot="1"]', '#adm-elite .slot[data-slot="3"]'); await sleep(900);
    ok('elite: dragging slot 1 onto slot 3 reorders the slots', (await order()).join() === 'Elite Two,Elite Three,Elite One', (await order()).join());
    const pp = patches.filter(x => x.sort !== undefined).map(x => `${x.id}:${x.sort}`).sort().join();
    ok('elite: new order is saved (sort 10/20/30 for the three pieces)', pp === 'e1:30,e2:10,e3:20', pp);
    ok('elite: "Order saved" message', /Order saved/.test(await p.textContent('#adm-note')));
    // arrows
    patches.length = 0;
    await p.locator('#adm-elite .slot[data-slot="3"] [data-act="left"]').click(); await sleep(700);
    ok('elite: left arrow moves a piece one slot earlier', (await order()).join() === 'Elite Two,Elite One,Elite Three', (await order()).join());
    ok('elite: first slot has no left arrow, last filled slot no right arrow', await p.locator('#adm-elite .slot[data-slot="1"] [data-act="left"]').isDisabled() && await p.locator('#adm-elite .slot[data-slot="3"] [data-act="right"]').isDisabled());
    // move to attire
    patches.length = 0;
    await p.locator('#adm-elite .slot[data-slot="3"] button:has-text("To Attire")').click(); await sleep(900);
    ok('elite: "To Attire" moves the piece out of the Elite Wardrobe', await p.locator('#adm-elite .slot:not(.empty)').count() === 2 && patches.some(x => x.collection === 'attire' && x.id === 'e3'), JSON.stringify(patches));
    await p.click('#tab-attire'); await sleep(600);
    ok('attire: list shows its pieces plus the moved one, counter x of 45', (await p.locator('#adm-attire .adm-list li').count()) === 3 && /3 of 45 products/.test(await p.textContent('#adm-attire h1')));
    ok('attire: shown as a grid of cards with a category tag on each', await p.locator('#adm-attire .adm-list.cards li').count() === 3 && await p.locator('#adm-attire .cp-tag select').count() === 3);
    ok('attire: tag filter lists all 7 categories (Formals … Street Wear, Jackets) even when some are empty', (await p.locator('#adm-attire .tags button').allTextContents()).map(t => t.replace(/\s*\d+$/, '')).join('|') === 'All|Formals|Casual Shirts|Jean Pants|Casual T-shirts|Polo T-shirts|Street Wear|Jackets');
    patches.length = 0;
    await p.locator('#adm-attire .cp-tag select').first().selectOption('jackets'); await sleep(500);
    ok('attire: tagging a product saves its category (Jackets)', patches.some(x => x.category === 'jackets'), JSON.stringify(patches));
    await p.click('#tag-jackets'); await sleep(300);
    ok('attire: the Jackets filter shows the tagged product', await p.locator('#adm-attire .adm-list.cards li').count() === 1);
    await p.click('#tag-all'); await sleep(300); await p.screenshot({ path: SH + 'adm-attire-grid.png', fullPage: true });
    ok('attire: Add product is available below 45', !(await p.locator('#adm-new').isDisabled()));
    // fill attire to 45 and check the cap
    ROWS = ROWS.concat(Array.from({ length: 42 }, (_, i) => P('x' + i, 'Filler ' + i, 'attire', 100 + i)));
    await p.click('#tab-orders'); await sleep(300); await p.click('#tab-attire'); await p.click('#tab-elite'); await p.click('#tab-attire'); await sleep(900);
    await p.goto(URL + 'admin/'); await p.waitForSelector('.slot'); await p.click('#tab-attire'); await sleep(800);
    ok('attire: at 45 products the button says Full and is disabled', (await p.locator('#adm-new').isDisabled()) && /Full \(45\)/.test(await p.textContent('#adm-new')), await p.textContent('#adm-new'));
    await p.click('#tab-elite'); await sleep(300);
    ok('elite: "To Attire" is disabled when the Attire Collection is full', await p.locator('#adm-elite .slot:not(.empty) button:has-text("To Attire")').first().isDisabled());
    ROWS = ROWS.filter(x => !x.id.startsWith('x'));
    // orders: paid
    await p.goto(URL + 'admin/'); await p.waitForSelector('.slot'); await p.click('#tab-orders'); await p.waitForSelector('#adm-orders li'); await sleep(300);
    patches.length = 0;
    await p.locator('#adm-orders li[data-ref="GF-3"] input[type=checkbox]').check(); await sleep(500);
    ok('orders: ticking Paid saves paid + paid_at', patches.some(x => x.order === 'GF-3' && x.paid === true && !!x.paid_at), JSON.stringify(patches));
    await p.locator('#adm-orders li[data-ref="GF-3"] input[type=checkbox]').uncheck(); await sleep(500);
    await p.screenshot({ path: SH + 'adm-orders.png' });
    // analytics (GF-3 back to unpaid)
    await p.click('#tab-analytics'); await p.waitForSelector('#an-kpis'); await sleep(500);
    const kp = id => p.textContent('#' + id);
    ok('analytics: sales = ₹1,04,980 (3 orders, cancelled excluded)', /1,04,980/.test(await kp('k-gross')) && /3 orders/.test(await kp('k-gross')), await kp('k-gross'));
    ok('analytics: money received = ₹92,980', /92,980/.test(await kp('k-collected')), await kp('k-collected'));
    ok('analytics: still to receive = ₹12,000', /12,000/.test(await kp('k-out')), await kp('k-out'));
    ok('analytics: average order ₹34,993 and 4 pieces sold', /34,993/.test(await kp('k-aov')) && /4 pieces/.test(await kp('k-aov')), await kp('k-aov'));
    ok('analytics: cancelled 1 (₹5,000)', /1/.test(await kp('k-cancel')) && /5,000/.test(await kp('k-cancel')), await kp('k-cancel'));
    ok('analytics: transactions table lists all 4 orders', await p.locator('#an-tx tbody tr').count() === 4);
    await p.screenshot({ path: SH + 'adm-analytics.png', fullPage: true });
    await p.selectOption('#an-range', '7'); await sleep(300);
    ok('analytics: charts present (columns, bars)', (await p.locator('.chart svg').count()) === 1 && (await p.locator('.bars').count()) === 4);
    await p.locator('.panel-h button').first().click(); await sleep(200);
    ok('analytics: "Show table" gives an accessible table alternative', (await p.locator('.panel table.tx').count()) >= 1);
    const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null); await p.click('#an-csv'); const d = await dl;
    ok('analytics: CSV download works', !!d && /godfather-transactions-/.test(d.suggestedFilename()), d && d.suggestedFilename());
    // mobile
    await p.setViewportSize({ width: 390, height: 844 }); await sleep(400);
    ok('mobile: no horizontal page overflow on Sales & payments', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));
    await p.screenshot({ path: SH + 'adm-analytics-mobile.png' });
    ok('no console errors', errs.length === 0, errs.join(' | '));
  } finally { await browser.close(); srv.kill(); }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
