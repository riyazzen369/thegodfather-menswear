const { chromium } = require('playwright'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT=require('path').join(__dirname,'..','shots'); require('fs').mkdirSync(OUT,{recursive:true});
(async()=>{ const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const c=await b.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}); const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message))
 await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(()=>sessionStorage.setItem('gf-entered','1')); await p.reload(); await sleep(4500)
 await p.keyboard.press('Escape'); await sleep(300); const t0=Date.now(); await p.locator('#choice-premium').click()
 await p.evaluate(()=>{ window.__rig.walkFreeze=3.85 }); await sleep(1500); await p.screenshot({path:OUT+'/10-vault-key-unlock.png'})
 await p.evaluate(()=>{ window.__rig.walkFreeze=4.75 }); await sleep(1500); await p.screenshot({path:OUT+'/11-vault-doors-gold-flood.png'})
 console.log('shots at', Date.now()-t0, 'ms');
 await p.evaluate(()=>{ window.__rig.walkFreeze=null }); await sleep(7000)
 console.log(JSON.stringify(await p.evaluate(()=>({view:window.__rig.view, act:document.querySelectorAll('.slide.is-active').length}))), 'errs', errs.join('|'))
 await b.close() })()
