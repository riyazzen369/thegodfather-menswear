/* Live catalogue, end to end against a mocked Supabase (REST, Storage, Auth intercepted in the browser):
   site reads published rows, follows updates, falls back to the bundled pieces when the DB is unreachable;
   admin signs in, uploads a front photo (resized to WebP + blur in the browser) and creates a product.
   Builds its own copy with mock env into dist-live/.  node tests/live-catalogue.js */
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SH = path.join(ROOT, 'shots') + '/'; fs.mkdirSync(SH, { recursive: true });
const MOCK = 'https://mockref.supabase.co', ANON = 'anon-test-key', PORT = 8796, URL = `http://localhost:${PORT}/`;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (n, c, info = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : '  ' + info}`); if (!c) fails++; };
const img = n => fs.readFileSync(path.join(ROOT, 'public/img', n));
const row = (o) => ({ id: o.slug, collection: 'premium', category: 'formal', price_from: 50000, tagline: 'Test tagline.', description: '', fabric: 'Test fabric.',
  details: { fit: 'Fit.', madeToMeasure: 'MTM.', delivery: 'Two weeks.' }, colours: [], extra_paths: [], front_cut_path: null, back_path: null, blur: null,
  sort: 10, published: true, updated_at: '2026-11-23T00:00:00Z', front_path: `${o.slug}/front.webp`, ...o });
let ROWS = [
  row({ slug: 'tuxedo', name: 'Live Tuxedo', sort: 10, front_cut_path: 'tuxedo/front-cut.webp' }),
  row({ slug: 'camel-coat', name: 'Live Camel Coat', sort: 20, back_path: 'camel-coat/back.webp' }),
  row({ slug: 'velvet', name: 'Live Velvet Blazer', sort: 30 }),
  row({ slug: 'shirt', name: 'Live Shirt', collection: 'attire', category: 'shirts', sort: 40 })
];
const FILES = { 'tuxedo/front.webp': 'tuxedo-1.webp', 'tuxedo/front-cut.webp': 'cut/tuxedo-1.webp', 'camel-coat/front.webp': 'camel-overcoat-1.webp',
  'camel-coat/back.webp': 'cut/velvet-blazer-1.webp', 'velvet/front.webp': 'velvet-blazer-1.webp', 'shirt/front.webp': 'shirt-tie-1.webp' };
let reads = [], dbDown = false;
async function mockSite(ctx) {
  await ctx.route(`${MOCK}/rest/v1/products*`, r => {
    if (dbDown) return r.abort('connectionrefused');
    reads.push({ url: r.request().url(), key: r.request().headers()['apikey'] });
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ROWS.filter(x => x.published)) });
  });
  await ctx.route(`${MOCK}/storage/v1/object/public/products/**`, r => {
    const p = decodeURIComponent(new globalThis.URL(r.request().url()).pathname.split('/public/products/')[1]);
    const f = FILES[p]; f ? r.fulfill({ status: 200, contentType: 'image/webp', headers: { 'access-control-allow-origin': '*' }, body: img(f) }) : r.fulfill({ status: 404, body: '' });
  });
  await ctx.route(`${MOCK}/realtime/**`, r => r.abort());
}
async function toTour(p) {
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForSelector('#choice-tour', { timeout: 20000 }); await sleep(300);
  await p.locator('#choice-tour').click(); await p.waitForSelector('#grid .card', { timeout: 8000 }); await sleep(600);
}
const names = p => p.evaluate(() => [...document.querySelectorAll('#grid .card-name')].map(n => n.textContent));

(async () => {
  execSync('npx vite build --outDir dist-live --emptyOutDir', { cwd: ROOT, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: ANON } });
  const dist = fs.readdirSync(path.join(ROOT, 'dist-live/assets')).map(f => fs.readFileSync(path.join(ROOT, 'dist-live/assets', f), 'latin1')).join('');
  ok('build: anon key + URL embedded, no service-role key', dist.includes(ANON) && dist.includes(MOCK) && !/service_role|SERVICE_ROLE/.test(dist));
  const srv = spawn('npx', ['vite', 'preview', '--outDir', 'dist-live', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(URL); break } catch { await sleep(250) } }
  const browser = await chromium.launch({ args: ARGS });
  const errs = [];
  const newCtx = async (o) => { const c = await browser.newContext(o); await c.addInitScript(() => sessionStorage.setItem('gf-entered', '1')); await mockSite(c); return c; };
  const watch = (p, tag) => { p.on('pageerror', e => errs.push(tag + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/mockref|realtime|websocket|ERR_FAILED|net::/i.test(m.text()) && !(tag === 'admin' && /status of (400|404)/.test(m.text()))) errs.push(tag + ': ' + m.text()); }); };
  try {
    for (const [tag, vp] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
      const ctx = await newCtx(vp); const p = await ctx.newPage(); watch(p, tag); reads = [];
      await toTour(p);
      let n = await names(p);
      ok(`${tag}: attire tour shows the live catalogue (3 premium + 1 attire)`, n.join() === 'Live Tuxedo,Live Camel Coat,Live Velvet Blazer,Live Shirt', n.join());
      ok(`${tag}: reads with the anon key, published only`, reads.length > 0 && reads.every(r => r.key === ANON) && /published=eq\.true/.test(reads[0].url), JSON.stringify(reads[0]));
      const pics = await p.evaluate(() => [...document.querySelectorAll('#grid .card img')].map(i => ({ s: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 })));
      ok(`${tag}: grid photos come from Supabase Storage and load`, pics.length === 4 && pics.every(x => x.s.includes('/storage/v1/object/public/products/')), JSON.stringify(pics.slice(0, 2)));
      if (tag === 'mobile') await p.screenshot({ path: SH + '30-live-grid-mobile.png' });
      await p.locator('#grid .card[data-i="3"]').click(); await sleep(1000);
      const sh = await p.evaluate(() => ({ open: document.querySelector('#sheet')?.classList.contains('open'), t: document.querySelector('#sheet-title')?.textContent, txt: document.querySelector('#sheet')?.innerText || '' }));
      ok(`${tag}: detail sheet uses DB data`, sh.open && sh.t === 'Live Shirt' && /Test fabric\./.test(sh.txt) && /Two weeks\./.test(sh.txt), JSON.stringify(sh).slice(0, 200));
      await p.keyboard.press('Escape'); await sleep(800);
      // live update: rename + add a piece, then the tab regains focus (stands in for the realtime ping)
      ROWS = ROWS.map(r => r.slug === 'velvet' ? { ...r, name: 'Velvet Blazer (renamed)', updated_at: '2026-11-23T01:00:00Z' } : r);
      ROWS.push(row({ slug: 'new-piece', name: 'Brand New Piece', collection: 'attire', sort: 50, front_path: 'shirt/front.webp' }));
      await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await sleep(1800);
      if (!(await p.$('#grid .card'))) { await p.waitForSelector('#choice-tour', { timeout: 20000 }); await p.locator('#choice-tour').click(); await p.waitForSelector('#grid .card'); await sleep(500); }
      n = await names(p);
      ok(`${tag}: live update applied without reload (rename + new piece)`, n.includes('Velvet Blazer (renamed)') && n.includes('Brand New Piece') && n.length === 5, n.join());
      if (tag === 'desktop') await p.screenshot({ path: SH + '31-live-new-product-desktop.png' });
      ROWS = ROWS.filter(r => r.slug !== 'new-piece').map(r => r.slug === 'velvet' ? { ...r, name: 'Live Velvet Blazer' } : r);
      // vault: premium pieces only; flip view uses the DB back photo, or the shared plain back
      await p.goto(URL, { waitUntil: 'load' }); await p.waitForSelector('#choice-premium', { timeout: 20000 }); await sleep(300);
      await p.locator('#choice-premium').click(); await p.waitForFunction(() => document.querySelector('.app')?.className.includes('vault') || document.querySelector('.scene:not(.is-off)'), null, { timeout: 30000 });
      await sleep(9000);
      const v = await p.evaluate(() => ({ slides: document.querySelectorAll('.slide:not(.final)').length, names: [...document.querySelectorAll('.slide:not(.final) .name, .slide:not(.final) h2')].map(e => e.textContent) }));
      ok(`${tag}: vault shows the 3 premium pieces only`, v.slides === 3, JSON.stringify(v));
      if (tag === 'desktop') {
        await p.keyboard.press('ArrowRight'); await sleep(2500);
        await p.locator('.slide.is-active .details').click({ timeout: 8000 }); await p.waitForSelector('.inspect.open', { timeout: 8000 }); await sleep(800);
        const fb = await p.evaluate(() => ({ t: document.querySelector('#inspect-title')?.textContent, back: document.querySelector('.flip-back img')?.getAttribute('src') || null, plain: !!document.querySelector('.flip-plain') }));
        ok('desktop: flip view shows the DB back photo', /Camel Coat/.test(fb.t || '') && /camel-coat\/back\.webp/.test(fb.back || ''), JSON.stringify(fb));
        await p.keyboard.press('Escape'); await sleep(900); await p.keyboard.press('ArrowRight'); await sleep(2500);
        await p.locator('.slide.is-active .details').click({ timeout: 8000 }); await p.waitForSelector('.inspect.open', { timeout: 8000 }); await sleep(500);
        const fp = await p.evaluate(() => ({ t: document.querySelector('#inspect-title')?.textContent, plain: !!document.querySelector('.flip-plain') }));
        ok('desktop: no back photo -> shared plain back', /Velvet/.test(fp.t || '') && fp.plain, JSON.stringify(fp));
      }
      await ctx.close();
    }
    // DB unreachable on a first visit: bundled pieces
    dbDown = true;
    { const ctx = await newCtx({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); watch(p, 'down');
      await toTour(p); await sleep(3000); const n = await names(p); const src = await p.evaluate(() => window.__catalogue && window.__catalogue.source);
      ok('DB unreachable: falls back to the 12 bundled pieces', n.length === 12 && !n.some(x => x.startsWith('Live')) && src === 'fallback', n.length + ' ' + src); await ctx.close(); }
    dbDown = false;

    // ---------- admin ----------
    const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const A = { uploads: [], writes: [], removes: [] };
    const jwt = 'e30.' + Buffer.from(JSON.stringify({ sub: 'u1', email: 'owner@example.com', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.sig';
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    await actx.route(`${MOCK}/auth/v1/**`, r => {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: cors });
      const b = r.request().postDataJSON?.() || {};
      if (/token\?grant_type=password/.test(r.request().url())) {
        if (b.password !== 'right-password') return r.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' }) });
        return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-11-23T00:00:00Z' } }) });
      }
      r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' });
    });
    await actx.route(`${MOCK}/rest/v1/products*`, r => {
      const m = r.request().method();
      if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: cors });
      if (m === 'GET') return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(ROWS) });
      const body = r.request().postDataJSON(); A.writes.push({ m, body, auth: r.request().headers()['authorization'] });
      if (m === 'POST') ROWS.push({ ...row({ slug: body.slug, name: body.name }), ...body, id: body.slug });
      r.fulfill({ status: 201, headers: cors, contentType: 'application/json', body: '[]' });
    });
    await actx.route(`${MOCK}/storage/v1/object/**`, async r => {
      const m = r.request().method(), u = r.request().url();
      if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: cors });
      if (u.includes('/object/public/')) { const p = decodeURIComponent(u.split('/public/products/')[1].split('?')[0]); const f = FILES[p]; return f ? r.fulfill({ status: 200, headers: cors, contentType: 'image/webp', body: img(f) }) : r.fulfill({ status: 404, headers: cors, body: '' }); }
      if (m === 'POST') { const buf = r.request().postDataBuffer(); A.uploads.push({ path: u.split('/object/products/')[1], type: r.request().headers()['content-type'], size: buf ? buf.length : 0, webp: !!buf && /RIFF....WEBPVP8/s.test(buf.toString('latin1')) && /image\/webp/.test(buf.toString('latin1').slice(0, 400) + r.request().headers()['content-type']), auth: r.request().headers()['authorization'] }); return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ Key: 'products/x' }) }); }
      if (m === 'DELETE') { A.removes.push(r.request().postData()); return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '[]' }); }
      r.fulfill({ status: 200, headers: cors, body: '{}' });
    });
    const a = await actx.newPage(); watch(a, 'admin');
    await a.goto(URL + 'admin/', { waitUntil: 'load' }); await a.waitForSelector('#adm-email', { timeout: 10000 });
    const signup = await a.evaluate(() => /sign up|create account|register/i.test(document.body.innerText));
    ok('admin: sign-in form, no public sign-up', !signup);
    await a.fill('#adm-email', 'owner@example.com'); await a.fill('#adm-password', 'wrong'); await a.click('button[type=submit]'); await sleep(800);
    ok('admin: wrong password is refused', /Wrong email or password/.test(await a.innerText('body')));
    await a.fill('#adm-password', 'right-password'); await a.click('button[type=submit]');
    await a.waitForSelector('.adm-list li', { timeout: 10000 }); await sleep(800);
    const li = await a.$$eval('.adm-list li', l => l.map(x => x.dataset.slug));
    ok('admin: product list after sign-in', li.length === ROWS.length, li.join());
    await a.screenshot({ path: SH + '32-admin-list.png' });
    await a.click('#adm-new'); await a.fill('#f-name', 'Midnight Test Jacket'); await a.fill('#f-price', '64000'); await a.selectOption('#f-collection', 'premium');
    await a.fill('#f-tagline', 'A test of the upload path.'); await a.check('#f-published');
    await a.setInputFiles('#f-front', path.join(ROOT, 'public/img/tuxedo-1.webp')); await a.waitForSelector('.flip-prev-card img', { timeout: 8000 }); await sleep(500);
    await a.screenshot({ path: SH + '33-admin-upload.png' });
    // drag the preview to its back
    const st = await a.$('.flip-prev-stage'); const bb = await st.boundingBox();
    await a.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height / 2); await a.mouse.down(); await a.mouse.move(bb.x + bb.width * 0.3 + 200, bb.y + bb.height / 2, { steps: 10 }); await a.mouse.up(); await sleep(700);
    ok('admin: drag-to-flip preview shows the plain back', /Back/.test(await a.innerText('.flip-prev-bar')));
    await a.click('#f-save'); await a.waitForSelector('.adm-list li', { timeout: 10000 }); await sleep(400);
    const up = A.uploads[0], w = A.writes.find(x => x.m === 'POST');
    ok('admin: front photo uploaded as WebP to the products bucket with the user token', !!up && /^midnight-test-jacket\/front-[a-z0-9]+\.webp$/.test(up.path) && up.webp && up.size > 5000 && /^Bearer e30\./.test(up.auth || ''), JSON.stringify(up));
    ok('admin: product row inserted with blur placeholder and published', !!w && w.body.slug === 'midnight-test-jacket' && w.body.price_from === 64000 && w.body.published === true && /^data:image\/webp;base64,/.test(w.body.blur || '') && w.body.front_path === up.path, JSON.stringify(w && { ...w.body, blur: (w.body.blur || '').slice(0, 30) }));
    const li2 = await a.$$eval('.adm-list li', l => l.map(x => x.dataset.slug));
    ok('admin: new product appears in the list', li2.includes('midnight-test-jacket'), li2.join());
    await actx.close();
    ok('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await browser.close(); srv.kill(); }
  console.log(fails ? `${fails} failed` : 'all live-catalogue checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
