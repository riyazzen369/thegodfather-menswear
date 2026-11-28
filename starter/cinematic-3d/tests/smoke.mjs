/* Smoke test: builds nothing, serves ./dist with vite preview, then checks the carousel like a visitor would.
   Run:  npm run build && npm test      (software GL is fine: it is slow but deterministic)  */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const sleep = ms => new Promise(r => setTimeout(r, ms)); mkdirSync('tests/out', { recursive: true })
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' })
for (let i = 0; i < 60; i++) { try { await fetch('http://localhost:4173/'); break } catch { await sleep(250) } }
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
for (const [name, vp, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1366, height: 768 }, false], ['landscape-phone', { width: 844, height: 390 }, true]]) {
  const b = await chromium.launch({ args: ARGS }), c = await b.newContext({ viewport: vp, hasTouch: mobile, isMobile: mobile }), p = await c.newPage()
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto('http://localhost:4173/?q=low'); await sleep(7000)
  const st = () => p.evaluate(() => ({ idx: window.__rig.index, p: +window.__rig.p.toFixed(2), canvas: !!document.querySelector('canvas'), ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }))
  let s = await st(); ok(s.canvas, `${name}: 3D canvas is mounted`); ok(s.ov <= 1, `${name}: no horizontal overflow`)
  await p.screenshot({ path: `tests/out/${name}-0-rest.png` })
  await p.keyboard.press('ArrowRight'); await sleep(2500); s = await st(); ok(s.idx === 1 && Math.abs(s.p - 1) < 0.05, `${name}: arrow key moves exactly one piece and settles (idx ${s.idx}, p ${s.p})`)
  // a hard flick still moves ONE piece
  const x0 = vp.width * 0.8, y = vp.height * 0.35; await p.mouse.move(x0, y); await p.mouse.down(); for (let i = 1; i <= 4; i++) { await p.mouse.move(x0 - i * 70, y); await sleep(8) } await p.mouse.up(); await sleep(2500)
  s = await st(); ok(s.idx === 2, `${name}: a hard flick moves one piece, not several (idx ${s.idx})`)
  await p.screenshot({ path: `tests/out/${name}-1-settled.png` })
  // hold a drag half way: a static frame mid-orbit
  await p.mouse.move(x0, y); await p.mouse.down(); await p.mouse.move(x0 - vp.width * 0.4, y, { steps: 5 }); await sleep(2500); await p.screenshot({ path: `tests/out/${name}-2-mid-orbit.png`}); await p.mouse.up(); await sleep(2000)
  ok(errs.length === 0, `${name}: no script errors${errs.length ? ' -> ' + [...new Set(errs)].slice(0, 3).join(' | ') : ''}`)
  await b.close()
}
srv.kill(); process.exit(fails ? 1 : 0)
