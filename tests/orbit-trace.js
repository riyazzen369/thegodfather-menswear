const { chromium } = require('playwright'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{ const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message))
 await p.goto('http://localhost:8795/'); await p.evaluate(()=>sessionStorage.setItem('gf-entered','1')); await p.reload(); await sleep(3000)
 await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium,#choice-classic').first().click().catch(()=>{}); await sleep(9000)
 const snap=()=>p.evaluate(()=>({view:window.__rig.view,p:+window.__rig.scrollP.toFixed(3),pe:window.__pe,over:window.__rig.over,px:window.__rig.pointer.x,nd:window.__rig.nudgeDir,vis:[...document.querySelectorAll('.track .stage')].map((e,i)=>[i,e.style.opacity||'1',e.style.visibility||'v']).filter(x=>x[2]!=='hidden').map(x=>x.join(':')).join(' ')}))
 console.log('rest', JSON.stringify(await snap()))
 // swipe one piece (drag 140px left, release slowly)
 await p.mouse.move(300,400); await p.mouse.down(); for(let i=1;i<=7;i++){await p.mouse.move(300-i*20,400); await sleep(40)} await p.mouse.up()
 for(let i=0;i<8;i++){ await sleep(150); console.log('t+'+((i+1)*150), JSON.stringify(await snap())) }
 // hard flick
 await p.mouse.move(320,400); await p.mouse.down(); for(let i=1;i<=4;i++){await p.mouse.move(320-i*70,400); await sleep(8)} await p.mouse.up()
 for(let i=0;i<6;i++){ await sleep(200); console.log('flick t+'+((i+1)*200), JSON.stringify(await snap())) }
 await p.screenshot({path:'/tmp/claude-0/-home-user/17185e6c-7f96-5d37-924e-3e018419cdff/scratchpad/rest.png'}); await sleep(100); console.log('settled', JSON.stringify(await snap()), await p.evaluate(()=>[...document.querySelectorAll('.track .slide')].map(s=>s.dataset.i+':'+s.className.includes('is-active')).join(' '))); console.log('errs',errs.join('|')); await b.close() })()
