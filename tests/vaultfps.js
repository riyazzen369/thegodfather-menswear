// vault slide smoothness on the box: arrow changes + mouse drags + (mobile) touch swipes; frame-time stats from rAF
const { chromium } = require('playwright'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const BASE = process.env.BASE || 'http://localhost:8795/'; const SHOTS = process.env.SHOTS; const OUT=require('path').join(__dirname,'..','shots'); require('fs').mkdirSync(OUT,{recursive:true});
(async()=>{ const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for (const [W,H] of (process.env.VPS||'1440x900,390x844').split(',').map(v=>v.split('x').map(Number))) { const mob=W<700
  const c=await b.newContext({viewport:{width:W,height:H},deviceScaleFactor:1,isMobile:mob,hasTouch:mob}); const p=await c.newPage()
  const errs=[]; p.on('pageerror',e=>errs.push(e.message))
  await p.goto(BASE+'?force3d&q=low'); await p.evaluate(()=>sessionStorage.setItem('gf-entered','1')); await p.reload(); await sleep(4500)
  await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium').click(); await sleep(1200); await p.keyboard.press('Escape'); await sleep(3500)
  await p.evaluate(()=>{ window.__ft=[]; const f=n=>{window.__ft.push(n); requestAnimationFrame(f)}; requestAnimationFrame(f) })
  for (let k=0;k<3;k++){ await p.keyboard.press('ArrowRight'); await sleep(1100) }
  if (mob) { const cdp=await c.newCDPSession(p); for (let k=0;k<2;k++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:320,y:420}]}); for(let j=1;j<=10;j++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:320-j*22,y:422}]}); await sleep(16) } await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await sleep(1200) } }
  else { for (let k=0;k<2;k++){ await p.mouse.move(1000,450); await p.mouse.down(); for(let j=1;j<=12;j++){ await p.mouse.move(1000-j*30,452); await sleep(16) } await p.mouse.up(); await sleep(1200) } }
  const st = await p.evaluate(()=>{ const t=window.__ft, d=[]; for(let i=1;i<t.length;i++) d.push(t[i]-t[i-1]); const s=[...d].sort((a,b)=>a-b); return { fps:+(d.length*1000/(t[t.length-1]-t[0])).toFixed(1), p95:+s[Math.floor(s.length*.95)].toFixed(1), max:+s[s.length-1].toFixed(1), long50:d.filter(x=>x>50).length, idx: window.__rig.index, q: window.__rig.quality } })
  console.log(W, JSON.stringify(st), errs.join(' | '))
  if (SHOTS) {
    if (!mob) { await p.keyboard.press('ArrowRight'); await sleep(260); await p.screenshot({path:`${OUT}/6-vault-mid-slide.png`}); await sleep(1400) }
    await p.locator('.slide.is-active .details').click(); await sleep(mob?4500:5000)
    await p.screenshot({path: mob?`${OUT}/9-inspect-mobile.png`:`${OUT}/7-inspect-angle-a.png`})
    if (!mob) { await p.mouse.move(700,450); await p.mouse.down(); for(let j=1;j<=10;j++){ await p.mouse.move(700+j*28,450); await sleep(30) } await p.mouse.up(); await sleep(1500); await p.screenshot({path:`${OUT}/8-inspect-angle-b.png`}) }
    await p.keyboard.press('Escape'); await sleep(700)
    console.log('after close', JSON.stringify(await p.evaluate(()=>({inspect:!!document.getElementById('inspect'), view:window.__rig.view, focus:document.activeElement?.className}))))
  }
  await c.close() }
 await b.close() })();
