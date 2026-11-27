/* A small, off-centre cut-out must be re-framed to fill the golden arch, centred (software GL). */
const { chromium } = require('playwright'); const { ARGS } = require('./gl'); const fs = require('fs'); const path = require('path')
const sleep = ms => new Promise(r => setTimeout(r, ms)); const OUT = path.join(__dirname, 'out', 'archfit'); fs.mkdirSync(OUT, { recursive: true })
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
;(async () => {
  const b = await chromium.launch({ args: ARGS }); const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage()
  const png = fs.readFileSync(path.join(__dirname, 'fixtures', 'small-subject.png'))
  await p.route('**/img/r/three-piece-1-512.webp', r => r.fulfill({ status: 200, contentType: 'image/png', body: png }))
  await p.goto('http://localhost:8795/?force3d&q=low'); await p.evaluate(() => { sessionStorage.setItem('gf-entered', '1'); sessionStorage.setItem('gf-peek', '1') }); await p.reload(); await sleep(5000)
  await p.keyboard.press('Escape'); await sleep(300); await p.locator('#choice-premium').click(); await sleep(2500); await p.locator('#walk-skip').click({ timeout: 4000 }).catch(() => {}); await sleep(10000)
  await p.addStyleTag({ content: '.track,.copy,.topbar,.bottombar{visibility:hidden!important}' }); await sleep(2000)
  const file = OUT + '/fit.png'; await p.screenshot({ path: file })
  await b.close()
  require('child_process').execSync(`python3 -c "
from PIL import Image
im=Image.open('${file}').convert('RGB'); W,H=im.size; px=im.load(); xs=[];ys=[]
for y in range(H):
    for x in range(W):
        r,g,bb=px[x,y]
        if r>150 and g<60 and bb<60: xs.append(x); ys.append(y)
print('red', (min(xs),max(xs),min(ys),max(ys)) if xs else None)
" > ${OUT}/red.txt`)
  const t = fs.readFileSync(OUT + '/red.txt', 'utf8'); console.log(t.trim())
  const m = t.match(/\((\d+), (\d+), (\d+), (\d+)\)/); ok(!!m, 'the subject is drawn')
  if (m) { const [x0, x1, y0, y1] = m.slice(1).map(Number); const cx = (x0 + x1) / 2, h = y1 - y0; ok(Math.abs(cx - 182) < 30, `centred (x ${cx.toFixed(0)} of 390, plane centre ~182)`); ok(h > 190 && h < 300, `fills the arch without poking out (${h}px; the piece area is ~300 px tall now)`) }
  process.exit(fails ? 1 : 0)
})()
