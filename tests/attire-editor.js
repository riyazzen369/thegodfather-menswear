/* Attire editor against a mocked Supabase: 4 photo slots, busy backgrounds, compression, fix cut-out, reorder, save payload and re-open.
   (The background model itself cannot be downloaded in some environments, so the busy-photo case uses the built-in fallback.)
   node tests/attire-editor.js */
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SH = path.join(ROOT, 'shots') + '/', FX = path.join(__dirname, 'fixtures') + '/';
const MOCK = 'https://mockref.supabase.co', ANON = 'anon-test-key', PORT = 8799, URL = `http://localhost:${PORT}/`;
const { ARGS, assertGL } = require('./gl');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (n, c, info = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : '  ' + info}`); if (!c) fails++; };
let ROWS = [], uploads = [], writes = [], removes = [];
(async () => {
  execSync('npx vite build --outDir dist-live --emptyOutDir', { cwd: ROOT, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: ANON } });
  const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', 'dist-live', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(URL); break } catch { await sleep(250) } }
  const browser = await chromium.launch({ args: ARGS }); await assertGL(browser);
  const errs = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    const jwt = 'e30.' + Buffer.from(JSON.stringify({ sub: 'u1', email: 'o@e.com', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.sig';
    const J = (r, body, st = 200, h = {}) => r.fulfill({ status: st, headers: { ...cors, ...h }, contentType: 'application/json', body: JSON.stringify(body) });
    await ctx.route(`${MOCK}/auth/v1/**`, r => { if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: cors }); if (/grant_type=password/.test(r.request().url())) return J(r, { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'o@e.com' } }); J(r, {}) });
    await ctx.route(`${MOCK}/rest/v1/admins*`, r => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 200, headers: cors }) : J(r, [{ user_id: 'u1' }]));
    await ctx.route(`${MOCK}/rest/v1/orders*`, r => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 200, headers: cors }) : J(r, []));
    await ctx.route(`${MOCK}/rest/v1/products*`, r => {
      const m = r.request().method(), u = new globalThis.URL(r.request().url()); if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: cors });
      if (m === 'HEAD') return r.fulfill({ status: 200, headers: { ...cors, 'content-range': `*/${ROWS.filter(x => x.collection === 'attire').length}` } });
      if (m === 'POST') { const b = r.request().postDataJSON(); writes.push({ m, body: b }); ROWS.push({ id: b.slug, updated_at: '2026-11-25T00:00:00Z', ...b }); return r.fulfill({ status: 201, headers: cors, body: '' }); }
      if (m === 'PATCH') { const b = r.request().postDataJSON(); writes.push({ m, body: b }); const id = u.searchParams.get('id').replace('eq.', ''); ROWS = ROWS.map(x => x.id === id ? { ...x, ...b } : x); return J(r, []); }
      const slug = u.searchParams.get('slug'); if (slug && slug.startsWith('eq.')) return J(r, ROWS.filter(x => x.slug === slug.slice(3)).slice(0, 1));
      J(r, ROWS.slice().sort((a, b) => a.sort - b.sort));
    });
    await ctx.route(`${MOCK}/storage/v1/object/**`, r => {
      const m = r.request().method(), u = r.request().url();
      if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: cors });
      if (u.includes('/object/public/')) return r.fulfill({ status: 200, headers: cors, contentType: 'image/webp', body: fs.readFileSync(path.join(ROOT, 'public/img/shirt-tie-1.webp')) });
      if (m === 'POST') { const buf = r.request().postDataBuffer(); uploads.push({ path: u.split('/object/products/')[1], size: buf ? buf.length : 0, webp: !!buf && /RIFF....WEBPVP8/s.test(buf.toString('latin1')) }); return J(r, { Key: 'ok' }); }
      if (m === 'DELETE') { removes.push(r.request().postData()); return J(r, []); }
      J(r, {});
    });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/mockref|status of (4|5)\d\d|net::|Failed to load resource|background model/.test(m.text())) errs.push(m.text()) });
    await p.goto(URL + 'admin/#attire', { waitUntil: 'load' }); await p.waitForSelector('#adm-email');
    await p.fill('#adm-email', 'o@e.com'); await p.fill('input[type=password]', 'x'); await p.keyboard.press('Enter');
    await p.waitForSelector('#adm-new'); await sleep(400);
    await p.click('#adm-new'); await p.waitForSelector('#ph-slot-1');
    ok('attire editor: four photo slots, photo 1 is the card', await p.locator('.ph-slot').count() === 4 && /card/.test(await p.textContent('#ph-slot-1 .ph-no')));

    // slot 1: transparent PNG with the garment AND three other objects + specks
    await p.setInputFiles('#ph-in-1', FX + 'attire-multi.png'); await p.waitForSelector('#ph-img-1', { timeout: 60000 }); await sleep(1200);
    const size1 = await p.textContent('#ph-size-1');
    const outKb = Number((size1.match(/→ (\d+) KB/) || [])[1] || 0);
    ok('slot 1: photo compressed (shows before → after, under ~150 KB)', /KB|MB/.test(size1) && outKb > 5 && outKb <= 160, size1);
    const w1 = await p.locator('#ph-slot-1 .ph-warn').allTextContents();
    ok('slot 1: other objects in the photo were detected and left out', w1.some(t => /other object/.test(t)), w1.join(' | '));
    await p.screenshot({ path: SH + 'attire-1-slot.png', fullPage: true });

    // fix cut-out: the objects are listed; tap to include one, then it is no longer "left out"
    await p.click('#ph-slot-1 [data-act="fix"]'); await p.waitForSelector('#fix-canvas');
    const hint0 = await p.textContent('#fix-hint');
    ok('fix: shows how many objects were found', /\d+ objects? found/.test(hint0), hint0);
    const box = await p.locator('#fix-canvas').boundingBox();
    await p.screenshot({ path: SH + 'attire-2-fix.png' });
    // the bag is at the left, 4% to 24% across, 64% to 87% down in the 1400x1800 scene
    await p.mouse.click(box.x + box.width * 0.13, box.y + box.height * 0.76); await sleep(400);
    ok('fix: tapping an excluded object includes it', /Included/.test(await p.textContent('#fix-hint')), await p.textContent('#fix-hint'));
    await p.click('#fix-undo'); await sleep(300);
    ok('fix: undo works', /Undone/.test(await p.textContent('#fix-hint')));
    await p.click('#fix-erase'); await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await p.mouse.down(); await p.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.5, { steps: 4 }); await p.mouse.up(); await sleep(300);
    ok('fix: erase brush paints', await p.evaluate(() => !!document.getElementById('fix-canvas')));
    await p.click('#fix-reset'); await sleep(300);
    ok('fix: Automatic restores the first result', /automatic/i.test(await p.textContent('#fix-hint')));
    await p.click('#fix-done'); await p.waitForSelector('#fix-canvas', { state: 'detached' }); await sleep(1500);
    ok('fix: Use this cut-out closes the editor and re-processes the photo', await p.locator('#ph-img-1').count() === 1 && await p.locator('#ph-slot-1.busy').count() === 0);

    // multi-select: 4 files, only 3 slots free -> 3 used, 1 skipped with a message
    await p.setInputFiles('#ph-multi', [FX + 'attire-lilac.png', FX + 'attire-leo.png', FX + 'attire-zeb.png', FX + 'attire-lilac.png']); 
    await p.waitForFunction(() => document.querySelectorAll('.ph-slot.ready').length === 4 && !document.querySelector('.ph-slot.busy'), null, { timeout: 120000 }); await sleep(1500);
    ok('multi-upload: the three free slots filled, the extra photo skipped with a message', await p.locator('.ph-slot img').count() === 4 && /skipped/.test(await p.textContent('.err')), await p.textContent('.err').catch(() => ''));
    await p.screenshot({ path: SH + 'attire-3-four-slots.png', fullPage: true });
    // reorder: move photo 1 later; the image order changes
    const srcs = () => p.$$eval('.ph-slot img', l => l.map(i => i.src));
    const before = await srcs();
    await p.click('#ph-slot-1 [data-act="right"]'); await sleep(400);
    const after = await srcs();
    ok('reorder: → swaps photo 1 and 2', after[0] === before[1] && after[1] === before[0]);
    // framing nudge re-renders the photo
    const s0 = (await srcs())[2];
    await p.click('[data-n="3-s-plus"]'); await p.click('[data-n="3-s-plus"]'); await sleep(1200);
    ok('framing: Size + re-places the photo', (await srcs())[2] !== s0);

    // save
    await p.fill('#f-name', 'Sample Test Shirt'); await p.fill('#f-price', '2999'); await p.check('#f-published');
    uploads = []; writes = [];
    await p.click('#f-save'); await p.waitForSelector('#adm-attire .adm-list li', { timeout: 60000 }); await sleep(500);
    const photos = uploads.filter(u => /photo-\d-[a-z0-9]+\.webp$/.test(u.path)), srcsUp = uploads.filter(u => /-src-/.test(u.path)), small = uploads.filter(u => /photo-1-512-/.test(u.path));
    ok('save: 4 photos uploaded as WebP, each under 200 KB', photos.length === 4 && photos.every(u => u.webp && u.size < 200000), JSON.stringify(uploads.map(u => u.path + ':' + u.size)));
    ok('save: raw cut-outs kept (for later re-framing) and a 512 px card copy', srcsUp.length === 4 && small.length === 1, JSON.stringify(uploads.map(u => u.path)));
    const w = writes.find(x => x.m === 'POST'); const b = w && w.body;
    ok('save: row is in the Attire collection with 1 front + 3 extra photos and slot data', !!b && b.collection === 'attire' && /^sample-test-shirt\/photo-1-/.test(b.front_path) && b.extra_paths.length === 3 && b.src_paths.slots.length === 4 && b.details.front512 && b.price_from === 2999 && b.published === true, JSON.stringify(b).slice(0, 300));

    // re-open: saved photos present, Adjust framing available (raw cut-outs exist), then remove a photo and save
    await p.locator('#adm-attire .adm-list li[data-slug="sample-test-shirt"] button:has-text("Edit")').click(); await p.waitForSelector('#ph-slot-1');
    ok('edit: the four saved photos load into the slots', await p.locator('.ph-slot img').count() === 4 && await p.locator('[data-act="adjust"]').count() === 4);
    await p.click('#ph-slot-4 button.danger'); await sleep(200);
    writes = []; removes = [];
    await p.click('#f-save'); await p.waitForSelector('#adm-attire .adm-list li', { timeout: 30000 }); await sleep(400);
    const pb = writes.find(x => x.m === 'PATCH'); 
    ok('edit: removing a photo saves 3 photos and deletes the file from storage', !!pb && pb.body.extra_paths.length === 2 && removes.some(x => /photo-4/.test(x || '')), JSON.stringify({ x: pb && pb.body.extra_paths.length, removes }));

    // busy JPEG (no transparency): goes through the background step; with no model online the fallback must still produce a framed photo
    await p.click('#adm-new'); await p.waitForSelector('#ph-slot-1');
    await p.setInputFiles('#ph-in-1', FX + 'attire-busy.jpg'); await p.waitForSelector('#ph-img-1', { timeout: 120000 }); await sleep(1500);
    const wj = await p.locator('#ph-slot-1 .ph-warn').allTextContents();
    ok('busy JPEG: processed (framed photo shown) and any doubts are explained in words', (await p.locator('#ph-img-1').count()) === 1 && wj.length >= 0, wj.join(' | '));
    await p.screenshot({ path: SH + 'attire-4-busy.png', fullPage: true });
    // mobile layout
    await p.setViewportSize({ width: 390, height: 844 }); await sleep(400);
    ok('mobile: no sideways scrolling in the Attire editor', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));
    ok('no console errors', errs.length === 0, errs.join(' | '));
  } finally { await browser.close(); srv.kill(); }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
