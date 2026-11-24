const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8795/';
require('fs').mkdirSync(require('path').join(__dirname, 'out'), { recursive: true });
const F = '?force3d';   // keep the 3D path under test instead of the slow-GPU fallback (also on software GL, GL=sw)
const SH = require('path').join(__dirname, '..', 'shots') + '/'; require('fs').mkdirSync(SH, { recursive: true });
const results = []; const ok = (name, pass, info='') => { results.push({name, pass, info}); console.log((pass?'PASS ':'FAIL ')+name+(info?' — '+info:'')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* software GL runs at a few fps: after every gesture wait for the rail to come to rest on a piece, instead of a fixed sleep */
const settle = async (pg, to) => { await pg.waitForFunction((to) => { const r = window.__rig, a = document.querySelector('.slide.is-active'); return a && (to === undefined || to === null || Math.round(r.scrollP) === to) && Math.abs(r.scrollP - Math.round(r.scrollP)) < 0.001 && +a.dataset.i === Math.round(r.scrollP) }, to, { timeout: 15000 }); await sleep(300); return pg.evaluate(() => +document.querySelector('.slide.is-active').dataset.i) };

const { ARGS, assertGL, sw: SOFTGL } = require('./gl');
const tailorInfo = page => page.evaluate(() => {
  const t = document.querySelector('#tailor'); if (!t) return null;
  const ch = [...t.querySelectorAll('.sf-choice')].map(b => { const r=b.getBoundingClientRect(); return {id:b.id, w:r.width, h:r.height, tag:b.tagName, href:b.href||'', op:getComputedStyle(b.parentElement).opacity}; });
  return { line: (t.querySelector('#host-line')||{}).textContent, typed: (t.querySelector('.sf-line')||{textContent:''}).textContent.length, done: t.classList.contains('typed'),
    ch, skip: !!t.querySelector('#tailor-skip'), focus: document.activeElement && (document.activeElement.className||document.activeElement.id),
    sceneHidden: getComputedStyle(document.querySelector('.scene')).visibility==='hidden', closing: t.classList.contains('closing'), leading: t.classList.contains('leading'), walking: t.classList.contains('walking') };
});
const pick = async (page, id, wait=1500) => { await page.locator('#choice-'+id).click(); await sleep(wait); };
let st;
const garment = page => page.evaluate(() => { const a = document.querySelector('.slide.is-active .garment'); if (!a) return null; const i = a.querySelector('img'); const r = a.getBoundingClientRect();
  return { loaded: !!i && i.complete && i.naturalWidth > 0, cls: a.className, op: i && getComputedStyle(i).opacity, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), src: i && i.currentSrc.split('/').pop() }; });
const state = page => page.evaluate(() => {
  const act = [...document.querySelectorAll('.slide.is-active')].map(s => +s.dataset.i);
  const tr = document.querySelector('.track'); const slides=[...document.querySelectorAll('.slide')];
  const snapped = slides.findIndex(s => Math.abs(s.offsetLeft - tr.scrollLeft) < 2);
  const sh = document.querySelector('#sheet');
  return { act, snapped, scroll: tr.scrollLeft, live: document.querySelector('#live').textContent,
    gate: !!document.querySelector('#gate'), vault: /\bvault\b/.test(document.querySelector('.app').className), grid: !!document.querySelector('#grid'), sheet: !!sh && sh.classList.contains('open'), mode: document.querySelector('.app').className,
    rigIndex: window.__rig && window.__rig.index, scrollP: window.__rig && window.__rig.scrollP };
});
async function swipe(cdp, x0, x1, y=420, steps=8, dur=180){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y}]});
  for (let i=1;i<=steps;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/steps,y}]}); await sleep(dur/steps); }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
const errs = [];
const watch = (p, tag) => { p.on('console', m => { if (m.type()==='error') errs.push(tag+': '+m.text()); }); p.on('pageerror', e => errs.push(tag+' pageerror: '+e.message)); };
(async () => {
  const browser = await chromium.launch({ args: ARGS }); const GLR = await assertGL(browser);
  // ---------- MOBILE 3D ----------
  const mctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
    recordVideo: process.env.NOVIDEO ? undefined : {dir:require('path').join(__dirname,'out','video'), size:{width:390,height:844}} });
  const m = await mctx.newPage(); watch(m,'mobile');
  const t0 = Date.now(); await m.goto(URL+F, {waitUntil:'load'});
  ok('mobile: page load', true, (Date.now()-t0)+'ms local');
  const boot = await (await fetch(URL)).text();
  ok('gate logo is in the HTML itself (painted before any script)', /id="boot-gate"/.test(boot) && /brand\/logo-800\.webp/.test(boot));
  await sleep(500);
  const early = await m.evaluate(() => ({ op: getComputedStyle(document.querySelector('#crest')).opacity, img: [...document.querySelectorAll('#crest .mark-img')].every(i => i.complete && i.naturalWidth > 0), f: getComputedStyle(document.querySelector('#crest .mark-img')).filter }));
  await m.screenshot({path:SH+'01a-gate-early-mobile.png'});
  ok('gate: logo visible by ~0.8s, crisp (no filter on the mark)', +early.op > 0.9 && early.img && early.f === 'none', JSON.stringify(early));
  await sleep(2600);
  const gateInfo = await m.evaluate(() => {
    const vis = [...document.querySelectorAll('button,a,[tabindex]')].filter(el => { const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); return r.width && r.height && cs.visibility!=='hidden' && !el.closest('.is-off'); }).map(el => el.id||el.className);
    return { vis, mode: document.querySelector('.app').className, gl: !!document.querySelector('canvas'), line: getComputedStyle(document.querySelector('#gate-line')).opacity, glOn: document.querySelector('#gate').className };
  });
  await m.screenshot({path:SH+'01-gate-mobile.png'});
  ok('3D mode active with WebGL canvas', /is3d/.test(gateInfo.mode) && gateInfo.gl, gateInfo.mode);
  ok('gate shows only the logo (single control)', gateInfo.vis.length===1 && gateInfo.vis[0]==='crest', JSON.stringify(gateInfo.vis));
  ok('gate line visible after 2.3s', +gateInfo.line > .9, gateInfo.line);
  ok('gate logo never handed to WebGL (stays DOM)', !/gl-on/.test(gateInfo.glOn) && /intro/.test(gateInfo.glOn), gateInfo.glOn);
  await m.locator('#crest').tap();
  const skipShown = await m.evaluate(() => !!document.querySelector('#skip'));
  ok('skip shown during transition', skipShown);

  await m.waitForSelector('#tailor', {timeout:6000}); await sleep(450);
  let ti = await tailorInfo(m);
  ok('mobile: storefront + Lorenzo appear after the entry, wardrobe hidden', !!ti && ti.sceneHidden && ti.skip, JSON.stringify(ti && {f:ti.focus}));
  ok('time-of-day greeting with both options (full text for screen readers)', ti && /^Good (morning|day|evening), sir\. Shall I show you The Godfather Attire Collection, or The Godfather Elite Wardrobe\?$/.test(ti.line), ti && ti.line);
  ok('dialogue types out (not all at once)', ti && ti.typed < ti.line.length, ti && ti.typed+'/'+ti.line.length);
  await m.waitForSelector('.tailor.typed', {timeout:12000}); await sleep(900);
  ti = await tailorInfo(m);
  ok('typing finishes, then two choices (>=44px)', ti.done && ti.typed===ti.line.length && ti.ch.length===2 && ti.ch.every(c => c.h>=44 && c.w>=44) && ti.ch.map(c=>c.id).join()==='choice-tour,choice-premium' && +ti.ch[1].op>0.9, JSON.stringify(ti.ch.map(c=>c.id+':'+Math.round(c.w)+'x'+Math.round(c.h)+'@'+c.op)));
  const hostOk = await m.evaluate(() => { const h=document.querySelector('.sf-host'); const r=h.getBoundingClientRect(); return r.right>innerWidth*0.85 && r.height>200 && getComputedStyle(h).opacity>0.9; });
  ok('Lorenzo stands bottom-right', hostOk);
  ok('greeting gets focus for screen readers', ti.focus==='sf-say', ti.focus);
  await m.screenshot({path:SH+'03-storefront-lorenzo-mobile.png'});
  await sleep(800);
  await m.locator('#choice-premium').tap(); await sleep(250);
  ti = await tailorInfo(m); ok('premium: one continuous walk starts (storefront hands over to the 3D camera)', ti && ti.walking && /view-walk/.test(await m.evaluate(() => document.querySelector('.app').className)));
  ok('walk has a Skip button', await m.evaluate(() => !!document.querySelector('#walk-skip')));
  await sleep(600); await m.screenshot({path:SH+'03b-walk-shop-mobile.png'});
  await sleep(900); await m.screenshot({path:SH+'03c-walk-wardrobe-mobile.png'});
  await sleep(900); await m.screenshot({path:SH+'03d-walk-stairs-mobile.png'});
  await sleep(1300); await m.screenshot({path:SH+'03e-walk-lorenzo-key-mobile.png'});
  await sleep(1200); await m.screenshot({path:SH+'03f-wardrobe-opening-mobile.png'});
  await sleep(2600);
  st = await state(m);
  ok('premium lands in the golden vault', st.vault && !(await tailorInfo(m)), st.mode);
  ok('tap opens doors and lands on item 1', !st.gate && st.act.length===1 && st.act[0]===0 && st.snapped===0, JSON.stringify(st));
  ok('live region announces item', st.live.startsWith('Item 1 of 12'), st.live);
  await sleep(800); await m.screenshot({path:SH+'04-vault-item1-mobile.png'});
  const gmm = await garment(m); ok('mobile: piece 1 picture visible', gmm && gmm.loaded && +gmm.op > 0.95, JSON.stringify(gmm));
  const cdp = await mctx.newCDPSession(m);
  for (let k=1;k<=3;k++){
    await swipe(cdp, 330, 90); await settle(m);
    st = await state(m);
    ok(`swipe ${k} snaps to exactly item ${k+1} (3D follows)`, st.act.length===1 && st.act[0]===k && st.snapped===k && Math.abs(st.scrollP-k)<0.01, JSON.stringify({act:st.act,snapped:st.snapped,p:st.scrollP}));
    if (k===2) await m.screenshot({path:SH+'05-vault-item3-animal-print-mobile.png'});
  }
  await swipe(cdp, 250, 200, 420, 4, 300); await settle(m);
  st = await state(m); ok('small swipe never rests between pieces', st.snapped>=0 && st.act.length===1, JSON.stringify({act:st.act,snapped:st.snapped}));
  const before = st.act[0];
  await swipe(cdp, 90, 330); await settle(m);
  st = await state(m); ok('swipe right goes back one', st.act[0]===before-1 && st.snapped===before-1, JSON.stringify(st.act));
  const cur = st.act[0];
  const delays = await m.evaluate(i => [...document.querySelectorAll(`.slide[data-i="${i}"] .line`)].map(l => getComputedStyle(l).transitionDelay.split(',')[0]), cur);
  ok('details rise one by one (0.12s stagger)', delays.join()==='0.62s,0.74s,0.86s,0.98s', delays.join());
  const small = await m.evaluate(() => [...document.querySelectorAll('.slide.is-active a, .slide.is-active button, .topbar a, .topbar button')].map(el => { const r=el.getBoundingClientRect(); return {t:(el.textContent.trim()||el.getAttribute('aria-label')).slice(0,20), w:Math.round(r.width), h:Math.round(r.height)}; }).filter(x => (x.w>0 || x.h>0) && (x.h<44 || x.w<44)));
  ok('touch targets >= 44px', small.length===0, JSON.stringify(small));
  const fpsM = await m.evaluate(() => window.__fps);
  /* software GL runs at a few fps: wait for the rail to settle on the piece before tapping (no tap during a glide) */
  /* (settle() is defined at the top of the file) */
  const curS = await settle(m);
  await m.locator(`.slide[data-i="${curS}"] .details`).tap(); await sleep(1400);
  ok('View details opens 3D inspect', await m.locator('.inspect').count()===1 && await m.locator('#inspect-wa').count()===1);
  await m.locator('#inspect-details').tap(); await sleep(1000);
  st = await state(m); ok('detail bottom sheet opens', st.sheet);
  const sb = await m.locator('#sheet').boundingBox();
  ok('mobile sheet is a bottom sheet', sb.y > 40 && Math.round(sb.y+sb.height) >= 843, JSON.stringify(sb));
  const si = await m.evaluate(() => ({ n: document.querySelectorAll('#gallery img').length, alts: [...document.querySelectorAll('#gallery img')].every(i => i.alt), wa: document.querySelector('#sheet-wa').href, specs: document.querySelector('#specs').innerText, loaded: [...document.querySelectorAll('#gallery img')].slice(0,2).every(i=>i.complete && i.naturalWidth>0) }));
  ok('sheet: 3-4 images with alt, specs, prefilled WhatsApp', si.n>=3 && si.n<=4 && si.alts && si.loaded && /enquire%20about%20the/.test(si.wa) && /Made to measure/.test(si.specs) && /Delivery/.test(si.specs), si.n+' imgs, '+si.wa);
  await m.screenshot({path:SH+'06-detail-sheet-mobile.png'});
  const gb = await m.locator('#gallery').boundingBox();
  await swipe(cdp, 330, 60, gb.y+gb.height/2); await sleep(900);
  const gl = await m.evaluate(() => document.querySelector('#gallery').scrollLeft);
  ok('gallery swipeable', gl > 100, 'scrollLeft '+gl);
  const hb = await m.locator('#grab').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:hb.y+12}]});
  for (let i=1;i<=8;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:hb.y+12+i*30}]}); await sleep(20); }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await sleep(1000);
  st = await state(m); ok('swipe down closes sheet', !st.sheet);
  await m.locator(`.slide[data-i="${await settle(m)}"] .details`).tap(); await sleep(1200);
  await m.locator('#inspect-details').tap(); await sleep(900);
  await m.keyboard.press('Escape'); await sleep(800);
  st = await state(m); ok('Esc closes sheet', !st.sheet);
  for (let k=0;k<14;k++){ await swipe(cdp, 330, 90); await sleep(1100); } /* walks past the last piece: no active slide to settle on */
  await sleep(1200);
  st = await state(m);
  const fin = await m.evaluate(() => document.querySelector('.slide.final').innerText);
  ok('final slide: explored Elite wearables, explore-collection button, WhatsApp and call', st.act[0]===12 && /You explored our handpicked niche Elite wearables\./.test(fin) && /Explore The Godfather Attire Collection/.test(fin) && /Call/.test(fin) && /WhatsApp/.test(fin), JSON.stringify(st.act));
  await m.screenshot({path:SH+'07-final-panel-mobile.png'});
  await m.click('#explore-collection'); await sleep(600);
  st = await state(m); const gh = await m.evaluate(() => document.getElementById('grid-title')?.innerText);
  ok('explore button on the final slide opens the Attire Collection grid', st.grid && gh === 'The Godfather Attire Collection', JSON.stringify({grid:st.grid, gh}));
  await m.screenshot({path:SH+'07b-final-to-collection.png'});
  await m.reload({waitUntil:'load'}); await sleep(1500);
  ti = await tailorInfo(m); st = await state(m);
  ok('returning visitor lands on the shopkeeper choice (gate and entry skipped)', !!ti && !st.gate, JSON.stringify({gate:st.gate}));
  await sleep(3600);
  await m.locator('#choice-tour').tap(); await sleep(250);
  ti = await tailorInfo(m); ok('tour: curtains close on the shopkeeper', ti && ti.closing);
  await sleep(1400);
  st = await state(m);
  /* focus moves to the heading a frame after the grid opens: wait for it, then read the real state */
  await m.waitForFunction(() => document.activeElement && document.activeElement.id === 'grid-title', null, { timeout: 4000 }).catch(() => {});
  const gi = await m.evaluate(() => { const cs=[...document.querySelectorAll('#grid .card')]; const lefts=[...new Set(cs.map(c=>Math.round(c.getBoundingClientRect().left)))];
    const c=cs[0], r=c.getBoundingClientRect(); return { n:cs.length, cols:lefts.length, name:c.querySelector('.card-name').textContent, price:(c.querySelector('.card-price')||{}).textContent, img:c.querySelector('img').getAttribute('src'), h:r.height, w:r.width, focus:document.activeElement.id }; });
  ok('attire tour: grid of all 12 pieces, 2 columns at 390px', st.grid && gi.n===12 && gi.cols===2 && /From/.test(gi.price) && gi.w>=44, JSON.stringify(gi));
  ok('attire tour heading takes focus', gi.focus==='grid-title', gi.focus);
  await sleep(600); await m.screenshot({path:SH+'16-attire-tour-grid-mobile.png'});
  await m.locator('#chip-wedding').tap(); await sleep(400);
  let nf = await m.evaluate(() => [...document.querySelectorAll('#grid .card-name')].map(n=>n.textContent));
  ok('filter chip: Wedding shows the bandhgala', nf.length===1 && /bandhgala/i.test(nf[0]), nf.join());
  await m.locator('#chip-statement').tap(); await sleep(400);
  nf = await m.evaluate(() => [...document.querySelectorAll('#grid .card-name')].map(n=>n.textContent));
  ok('filter chip: Statement shows velvet and the animal prints', nf.length===4 && /Velvet/.test(nf.join()) && /Animal/.test(nf.join()), nf.join());
  await m.locator('#chip-all').tap(); await sleep(400);
  await m.locator('#grid .card[data-i="2"]').tap(); await sleep(1100);
  st = await state(m);
  const gt = await m.evaluate(() => document.querySelector('#sheet-title') && document.querySelector('#sheet-title').textContent);
  ok('grid card opens the same detail sheet', st.sheet && /Animal-print/.test(gt), gt);
  await m.screenshot({path:SH+'17-attire-tour-detail-mobile.png'});
  await m.keyboard.press('Escape'); await sleep(900);
  const rf = await m.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.i);
  st = await state(m); ok('closing the sheet returns focus to the card', !st.sheet && rf==='2', String(rf));
  const tb = await m.evaluate(() => ['#home','#ask','#book'].map(q => { const e=document.querySelector(q); if(!e) return q+':none'; const r=e.getBoundingClientRect(); return r.width>=44&&r.height>=44&&r.top>=0 ? 'ok' : q+':'+r.width+'x'+r.height; }));
  ok('grid top bar: logo, Ask the tailor, Book a fitting (44px)', tb.every(x=>x==='ok'), tb.join());
  await m.evaluate(() => document.querySelector('#grid').scrollTo(0, 99999)); await sleep(500);
  await m.locator('#enter-vault').tap();
  /* Skip exists for a few seconds of the walk: wait for it instead of guessing the timing; if the walk already ended on its own, skipping is not needed */
  await m.waitForSelector('#walk-skip', { timeout: 8000 }).catch(() => {});
  await m.locator('#walk-skip').tap({ timeout: 3000 }).catch(() => {});
  await settle(m, 0); /* the vault is open on piece 1 */
  st = await state(m); ok('grid links into the premium wardrobe (piece 1)', st.vault && !st.grid && st.act[0]===0 && st.snapped===0, JSON.stringify({act:st.act, mode:st.mode}));
  const askVis = await m.evaluate(() => { const b=document.querySelector('#ask'); const r=b.getBoundingClientRect(); return r.width>=44 && r.height>=44 && r.top>=0 && b.getAttribute('aria-label'); });
  ok('top bar has Ask the tailor (44px)', askVis==='Ask the tailor', String(askVis));
  await m.locator('#ask').tap(); await sleep(4400);
  ti = await tailorInfo(m); ok('Ask the tailor reopens the shopkeeper choice', !!ti && ti.ch.length===2);
  await m.locator('#choice-tour').tap(); await sleep(1800);
  st = await state(m); ok('tour choice routes to the grid', st.grid);
  await m.locator('#ask').tap(); await sleep(700); await m.keyboard.press('Escape'); await sleep(500);
  ti = await tailorInfo(m); ok('Escape finishes the intro instantly (full line + choices)', ti && ti.done && ti.typed===ti.line.length);
  await m.locator('#choice-premium').tap(); await sleep(14200);
  st = await state(m); ok('premium again: vault, piece 1', st.vault && st.act[0]===0 && !(await tailorInfo(m)));
  await m.locator('#home').tap(); await sleep(1800);
  st = await state(m); ok('logo returns to the gate', st.gate);
  await sleep(2000);
  await m.locator('#crest').tap(); await sleep(300); await m.locator('#skip').tap(); await sleep(900);
  ti = await tailorInfo(m); ok('entry Skip goes to the shopkeeper', !!ti);
  await m.locator('#tailor-skip').tap(); await sleep(400);
  ti = await tailorInfo(m); ok('Skip on the storefront shows the choices at once', ti && ti.done);
  await m.locator('#choice-premium').tap(); await sleep(1600); await m.keyboard.press('Escape'); await sleep(1300);
  st = await state(m);
  const book = await m.evaluate(() => { const b=document.querySelector('#book'); const r=b.getBoundingClientRect(); return {href:b.href, vis:r.width>0 && r.top>=0}; });
  ok('skip works; booking one tap away', !st.gate && st.act[0]===0 && book.vis && /wa\.me/.test(book.href), book.href);
  await mctx.close();

  // ---------- DESKTOP 3D ----------
  const dctx = await browser.newContext({ viewport:{width:1440,height:900}, recordVideo: process.env.NOVIDEO ? undefined : {dir:require('path').join(__dirname,'out','video-desktop'), size:{width:1440,height:900}} });
  const d = await dctx.newPage(); watch(d,'desktop');
  await d.goto(URL+F); await sleep(3200);
  await d.mouse.move(980, 330); await sleep(800);
  await d.screenshot({path:SH+'08-gate-desktop.png'});
  const ring = await d.evaluate(() => { const r=getComputedStyle(document.querySelector('.ring')); return r.opacity+' '+r.borderTopColor; });
  ok('desktop: red ring cursor on gate', parseFloat(ring) > .5 && /255, 42, 58/.test(ring), ring);
  await d.locator('#crest').click(); await d.waitForSelector('.tailor.typed', {timeout:60000}); await sleep(900);
  ti = await tailorInfo(d); ok('desktop: shopkeeper scene shown', !!ti && ti.ch.length===2);
  const navTxt = await d.evaluate(() => [...document.querySelectorAll('.sf-nav nav button')].map(b => b.textContent.trim()).join('|'));
  ok('storefront nav: Collections, Visit, Contacts, Elite wardrobe (no Tailoring)', navTxt === 'Collections|Visit|Contacts|Elite wardrobe', navTxt);
  await d.locator('#nav-contacts').click(); await sleep(400);
  const cc = await d.evaluate(() => ({ dlg: !!document.querySelector('[role=dialog] #contact-wa, #contact-title'), tel: document.getElementById('contact-call')?.getAttribute('href'), wa: document.getElementById('contact-wa')?.getAttribute('href') }));
  ok('Contacts opens a dialog with WhatsApp and call links', cc.dlg && /^tel:\+/.test(cc.tel) && /wa\.me/.test(cc.wa), JSON.stringify(cc));
  await d.keyboard.press('Escape'); await sleep(300);
  ok('Esc closes the Contacts dialog', !(await d.evaluate(() => !!document.getElementById('contact-title'))));
  const host = await d.evaluate(() => ({ ember: document.querySelectorAll('.cig-ember').length, smoke: document.querySelectorAll('.cig-smoke i').length, lids: document.querySelectorAll('.cat-lid').length,
    emberAnim: document.querySelector('.cig-ember')?.getAnimations().length || 0, img: document.querySelector('.sf-host img')?.currentSrc || '', panelR: document.querySelector('.sf-panel').getBoundingClientRect().right, catX: document.querySelector('.sf-host').getBoundingClientRect().left + document.querySelector('.sf-host').getBoundingClientRect().width * 0.3 }));
  ok('desktop: Lorenzo has a live cigar (ember + smoke) and the cat blinks', host.ember===1 && host.smoke===5 && host.lids===2 && host.emberAnim>0 && /lorenzo/.test(host.img), JSON.stringify(host));
  ok('desktop: the panel leaves the cat and cigar in view', host.panelR <= host.catX - 40, JSON.stringify(host));
  await d.mouse.move(1000, 480); await sleep(300);
  await d.screenshot({path:SH+'03-storefront-lorenzo-desktop.png'});
  await d.locator('#choice-premium').click(); await sleep(1700);
  await d.screenshot({path:SH+'03b-walk-shop-desktop.png'});
  await sleep(900); await d.screenshot({path:SH+'03c-walk-wardrobe-desktop.png'});
  await sleep(900); await d.screenshot({path:SH+'03d-walk-stairs-desktop.png'});
  await sleep(1300); await d.screenshot({path:SH+'03e-walk-lorenzo-key-desktop.png'});
  await sleep(1200); await d.screenshot({path:SH+'03f-wardrobe-opening-desktop.png'});
  await sleep(2800);
  st = await state(d); ok('desktop: premium enters the vault, item 1', st.vault && st.act[0]===0 && !st.gate);
  var gm = await garment(d); ok('desktop: piece 1 picture is visible (DOM, responsive source)', gm && gm.loaded && +gm.op > 0.95 && gm.w > 300 && /\.(avif|webp)$/.test(gm.src), JSON.stringify(gm));
  const peek = await d.evaluate(() => document.querySelectorAll('.slide')[1].getBoundingClientRect().left / innerWidth);
  ok('next slide starts at 92% (8% peek)', Math.abs(peek-.92)<.01, peek.toFixed(3));
  await sleep(600); await d.screenshot({path:SH+'09-vault-desktop.png'});
  await d.keyboard.press('ArrowRight'); await settle(d, 1);
  st = await state(d); ok('ArrowRight advances one', st.act[0]===1 && st.snapped===1);
  await sleep(500); await d.screenshot({path:SH+'10-vault-velvet-desktop.png'});
  await d.keyboard.press('ArrowLeft'); await settle(d, 0);
  st = await state(d); ok('ArrowLeft back one', st.act[0]===0 && st.snapped===0);
  await d.keyboard.press('ArrowLeft'); await settle(d);
  st = await state(d); ok('first piece resists at edge', st.act[0]===0 && st.snapped===0);
  await d.mouse.move(700,450);
  // software GL renders ~7fps here, so a real 16ms wheel burst is replayed inside the page as one gesture
  const burst = (dx, dy) => d.evaluate(([dx,dy]) => { for (let i=0;i<12;i++) window.dispatchEvent(new WheelEvent('wheel',{deltaX:dx,deltaY:dy,cancelable:true,bubbles:true})); }, [dx,dy]);
  await burst(0,40);
  await settle(d, 1); st = await state(d); ok('vertical wheel gesture = one piece', st.act[0]===1 && st.snapped===1, JSON.stringify(st.act));
  await burst(30,0);
  await settle(d, 2); st = await state(d); ok('trackpad horizontal gesture = one piece', st.act[0]===2 && st.snapped===2, JSON.stringify(st.act));
  await d.mouse.wheel(0,-100); await settle(d, 1);
  st = await state(d); ok('single wheel notch back = one piece', st.act[0]===1 && st.snapped===1, JSON.stringify(st.act));
  await d.mouse.move(1000,450); await d.mouse.down();
  for (let i=1;i<=10;i++){ await d.mouse.move(1000-i*30,450); await sleep(16); }
  await d.mouse.up(); await settle(d);
  st = await state(d); ok('click-and-drag = one piece', st.act[0]===2 && st.snapped===2, JSON.stringify(st.act));
  await d.mouse.move(400,450); await d.mouse.down();
  for (let i=1;i<=10;i++){ await d.mouse.move(400+i*5,450); await sleep(60); }
  await d.mouse.up(); await settle(d, 2);
  st = await state(d); ok('short slow drag returns to same piece', st.act[0]===2 && st.snapped===2, JSON.stringify(st.act));
  await d.locator('#next').click(); await settle(d, 3);
  st = await state(d); ok('next arrow button', st.act[0]===3 && st.snapped===3);
  await d.locator('#prev').click(); await settle(d);
  st = await state(d); ok('prev arrow button', st.act[0]===2 && st.snapped===2);
  await sleep(800);
  const fpsD = await d.evaluate(() => window.__fps);
  await d.locator('.slide[data-i="2"] .details').click(); await sleep(1500);
  ok('desktop inspect opens (flip card)', await d.locator('.inspect .flip-card').count()>0);
  await d.keyboard.press('Escape'); await sleep(700);
  const fi = await d.evaluate(() => ({ open: !!document.querySelector('.inspect'), fe: document.activeElement && document.activeElement.className }));
  ok('Esc closes inspect, focus returns to View details', !fi.open && /details/.test(fi.fe||''), JSON.stringify(fi));
  await d.locator('.slide[data-i="2"] .details').click(); await sleep(1200);
  await d.locator('#inspect-details').click(); await sleep(1000);
  const pb = await d.locator('#sheet').boundingBox();
  ok('desktop details = right-side panel', pb.x > 900 && pb.height >= 899, JSON.stringify(pb));
  await d.screenshot({path:SH+'11-detail-panel-desktop.png'});
  await d.keyboard.press('Escape'); await sleep(900);
  st = await state(d); ok('Esc closes panel', !st.sheet);
  const fe = await d.evaluate(() => document.activeElement && document.activeElement.className);
  ok('focus returns after panel close', !!fe, fe);
  await d.keyboard.press('Tab'); await sleep(200);
  const outline = await d.evaluate(() => { const el=document.activeElement, cs=getComputedStyle(el); return el.tagName+' '+cs.outlineStyle+' '+cs.outlineColor; });
  ok('visible focus ring', /solid/.test(outline), outline);
  await d.keyboard.press('End'); await sleep(1600);
  await d.screenshot({path:SH+'12-final-panel-desktop.png'});
  await d.locator('#ask').click(); await sleep(4400);
  await d.locator('#choice-tour').click(); await sleep(1800);
  const dg = await d.evaluate(() => { const cs=[...document.querySelectorAll('#grid .card')]; return { n:cs.length, cols:[...new Set(cs.map(c=>Math.round(c.getBoundingClientRect().left)))].length }; });
  ok('desktop attire tour: 4 columns at 1440px', dg.n===12 && dg.cols===4, JSON.stringify(dg));
  await sleep(500); await d.screenshot({path:SH+'16-attire-tour-grid-desktop.png'});
  await d.locator('#grid .card[data-i="6"]').click(); await sleep(1200);
  st = await state(d); ok('desktop: grid card opens the detail panel', st.sheet);
  await d.screenshot({path:SH+'17-attire-tour-detail-desktop.png'});
  // ---------- SHOP: size, pincode, cart, checkout ----------
  await d.route('https://api.postalpincode.in/pincode/*', r => { const pin = r.request().url().split('/').pop(); r.fulfill({ json: pin === '560001' ? [{ Status:'Success', PostOffice:[{ Name:'Bangalore GPO', District:'Bengaluru', State:'Karnataka' }] }] : pin === '795001' ? [{ Status:'Success', PostOffice:[{ Name:'Imphal', District:'Imphal West', State:'Manipur' }] }] : [{ Status:'Error', PostOffice:null }] }) });
  const sizesOk = await d.evaluate(() => [...document.querySelectorAll('#shop .chip')].map(c => c.textContent).join(','));
  ok('shop: sizes S,M,L,XL,XXL, price shown', sizesOk === 'S,M,L,XL,XXL' && /₹/.test(await d.locator('.shop-price').textContent()), sizesOk);
  await d.locator('#add-cart').click(); await sleep(200);
  ok('shop: add to cart without a size asks for a size', /choose a size/i.test(await d.locator('#shop [role=alert]').textContent()));
  await d.locator('#shop .chip[data-size="L"]').click();
  await d.fill('#shop-pin', '560001'); await sleep(500);
  ok('shop: pincode in Karnataka -> 1-2 days', /Karnataka[\s\S]*1–2 days/.test(await d.locator('#shop-pin-out').textContent()), await d.locator('#shop-pin-out').textContent());
  await d.fill('#shop-pin', '795001'); await sleep(500);
  ok('shop: far pincode -> up to 7 days', /5–7 days/.test(await d.locator('#shop-pin-out').textContent()));
  await d.fill('#shop-pin', '000000'); await d.keyboard.press('Enter'); await sleep(300);
  ok('shop: invalid pincode rejected', /valid 6-digit/.test(await d.locator('#shop-pin-out').textContent()));
  await d.locator('#add-cart').click(); await sleep(400);
  ok('shop: add to cart opens the cart with the line', await d.locator('#cart .lines li').count() === 1 && /Size L/.test(await d.locator('#cart .lines li').textContent()));
  await d.locator('#cart .qty.small button').nth(1).click(); await sleep(150);
  ok('cart: quantity + updates the total', /2/.test(await d.locator('#cart .qty.small output').textContent()));
  await d.locator('#checkout-go').click(); await sleep(200);
  await d.locator('#place-order').click(); await sleep(150);
  ok('checkout: empty form is rejected', /enter your name/i.test(await d.locator('#checkout [role=alert]').textContent()));
  await d.fill('#co-name', 'Test Buyer'); await d.fill('#co-phone', '9876543210'); await d.fill('#co-address', '12 MG Road, Bengaluru'); await d.fill('#co-pincode', '560001');
  ok('checkout: UPI hidden until a UPI ID is configured', await d.locator('input[name=pay]').count() === 2);
  const pop = d.context().waitForEvent('page', { timeout: 4000 }).catch(() => null);
  await d.locator('#place-order').click(); await sleep(800);
  const pg = await pop; const wurl = pg ? pg.url() : '';
  ok('checkout: COD order confirmed with a reference and WhatsApp message', /GF\d{6}-/.test(await d.locator('#order-done').textContent()) && (!pg || /wa\.me/.test(wurl)), wurl);
  ok('checkout: cart emptied after order', await d.evaluate(() => localStorage.getItem('gf-cart')) === '[]');
  await d.keyboard.press('Escape'); await sleep(300);
  ok('Esc closes the cart, product sheet stays', !(await d.locator('#cart').count()) && (await state(d)).sheet);
  await d.keyboard.press('Escape'); await sleep(800);
  await d.locator('#home').click(); await sleep(1600);
  st = await state(d); ok('desktop: logo returns to gate', st.gate);
  await dctx.close();

  // ---------- TABLET ----------
  const tctx = await browser.newContext({ viewport:{width:820,height:1180}, isMobile:true, hasTouch:true });
  const t = await tctx.newPage(); watch(t,'tablet');
  await t.goto(URL+F); await t.evaluate(() => sessionStorage.setItem('gf-entered','1')); await t.reload(); await sleep(4800);
  await t.screenshot({path:SH+'13b-storefront-tablet.png'});
  await t.locator('#choice-premium').tap(); await sleep(14500);
  await t.screenshot({path:SH+'13-vault-tablet.png'});
  /* the GPU drops out: carry on in the 2D room with the picture still there */
  await t.evaluate(() => { const c = document.querySelector('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); g.getExtension('WEBGL_lose_context').loseContext(); });
  await sleep(1200);
  const lost = await t.evaluate(() => ({ mode: document.querySelector('.app').className, gl: !!document.querySelector('canvas') }));
  gm = await garment(t);
  ok('WebGL context lost: falls back to the 2D room, picture still shown', /is2d/.test(lost.mode) && !lost.gl && gm && gm.loaded, JSON.stringify({lost, gm}));
  await tctx.close();

  // ---------- REDUCED MOTION (2D fallback) ----------
  const rctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, reducedMotion:'reduce' });
  const r = await rctx.newPage(); watch(r,'reduced');
  await r.goto(URL+F); await sleep(2800);
  const rm = await r.evaluate(() => ({ mode: document.querySelector('.app').className, gl: !!document.querySelector('canvas') }));
  ok('reduced motion uses 2D fallback (no WebGL)', /is2d/.test(rm.mode) && !rm.gl, rm.mode);
  await r.screenshot({path:SH+'14-gate-reduced-motion.png'});
  await r.locator('#crest').tap(); await sleep(120);
  const doorAnim = await r.evaluate(() => document.querySelector('.half.l') ? document.querySelector('.half.l').getAnimations().length : 0);
  await sleep(900);
  ti = await tailorInfo(r);
  const tAnim = await r.evaluate(() => document.querySelector('.sf-host img').getAnimations().length + document.querySelector('.sf-host').getAnimations().length);
  ok('reduced: shopkeeper shown with a simple fade (no sway)', !!ti && tAnim===0, 'anims '+tAnim);
  await sleep(600); await r.screenshot({path:SH+'14b-storefront-reduced-motion.png'});
  await r.locator('#choice-premium').tap(); await sleep(900);
  st = await state(r); ok('reduced: no door animation, fade into item 1', doorAnim===0 && !st.gate && st.act[0]===0, 'door anims '+doorAnim);
  const tf = await r.evaluate(() => getComputedStyle(document.querySelector('.slide.is-active .garment')).transform);
  ok('reduced: garment fades only', tf==='none', tf);
  await r.keyboard.press('ArrowRight'); await sleep(500);
  st = await state(r); ok('reduced: arrow key moves instantly', st.act[0]===1 && st.snapped===1);
  await sleep(500); await r.screenshot({path:SH+'15-wardrobe-reduced-motion.png'});
  await rctx.close();

  // ---------- 2D fallback without reduced motion (no WebGL) ----------
  const nctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  const n = await nctx.newPage(); watch(n,'2d');
  await n.goto(URL+'?2d'); await sleep(2800);
  await n.locator('#crest').tap(); await sleep(150);
  const da = await n.evaluate(() => document.querySelector('.half.l').getAnimations().length);
  await sleep(1800);
  ok('no-WebGL fallback: shopkeeper shown', !!(await tailorInfo(n)));
  await n.locator('#tailor-skip').tap(); await sleep(300); await n.locator('#choice-premium').tap(); await sleep(5000);
  st = await state(n); ok('no-WebGL fallback: CSS doors open, lands on item 1', da>0 && !st.gate && st.act[0]===0, 'door anims '+da);
  await nctx.close();

  ok('no console errors', errs.length===0, errs.join(' | ').slice(0,800));
  console.log('FPS (' + GLR + '): mobile', fpsM, 'desktop', fpsD);
  await browser.close();
  const f = results.filter(x => !x.pass);
  process.exitCode = f.length ? 1 : 0; // a failed check must fail the run
  console.log(`\n${results.length-f.length}/${results.length} passed`);
  require('fs').writeFileSync(require('path').join(__dirname,'out','results3d.json'), JSON.stringify({results, fpsM, fpsD},null,1));
})();
