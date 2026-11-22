/* Upload normaliser: turns any product photo (phone shot of a T-shirt on a bed, a studio cut-out, …) into the house format
   so it sits in the vault and the flip view like the bundled pieces.
     1. background removal (@imgly/background-removal, loaded lazily, admin only; falls back to a plain-backdrop key)
     2. crop to the garment's bounding box
     3. place on the standard 3:4 canvas: top at 11%, centred, inside 72% x 76% (same frame as public/img/cut/*)
        + nudges (scale, x, y). A back is sized to the front's placed height so the flip lines up.
     4. light warm grade, then WebP: transparent cut-out (flip view) and a photo on the red-velvet plate (vault, grid), + blur */
export type Nudge = { s: number; x: number; y: number }
export const NUDGE0: Nudge = { s: 1, x: 0, y: 0 }
export type Cut = { bmp: ImageBitmap; method: 'ai' | 'key' | 'alpha' }
export type Placed = { cut: Blob; cutUrl: string; photo?: Blob; photoUrl?: string; blur: string; box: { w: number; h: number } }

const CW = 1200, CH = 1600            // cut-out canvas
const PW = 864, PH = 1152             // vault photo, like public/img/<slug>-1.webp
const TOP = 0.11, MAXW = 0.72, MAXH = 0.76

const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const toBlob = (c: HTMLCanvasElement, q = 0.88) => new Promise<Blob>((res, rej) => c.toBlob(b => b && b.type === 'image/webp' ? res(b) : rej(new Error('This browser cannot encode WebP. Use Chrome, Edge or Firefox.')), 'image/webp', q))

function hasAlpha(bmp: ImageBitmap) {
  const c = canvas(64, Math.round(64 * bmp.height / bmp.width)); const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0, c.width, c.height)
  const d = g.getImageData(0, 0, c.width, c.height).data; let t = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] < 200) t++
  return t > d.length / 4 * 0.05
}

/* fallback: flood the backdrop from the borders by colour distance (works for plain walls, sheets, paper) */
function keyOut(bmp: ImageBitmap): ImageBitmap | Promise<ImageBitmap> {
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k)
  const c = canvas(w, h), g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(bmp, 0, 0, w, h)
  const im = g.getImageData(0, 0, w, h), d = im.data
  const seen = new Uint8Array(w * h), q: number[] = []
  const thr = 38 * 38
  const push = (x: number, y: number, r: number, gg: number, b: number) => {
    const i = y * w + x; if (seen[i]) return
    const o = i * 4, dr = d[o] - r, dg = d[o + 1] - gg, db = d[o + 2] - b
    if (dr * dr + dg * dg + db * db > thr) return
    seen[i] = 1; q.push(i)
  }
  for (let x = 0; x < w; x++) { const a = x * 4, b = ((h - 1) * w + x) * 4; push(x, 0, d[a], d[a + 1], d[a + 2]); push(x, h - 1, d[b], d[b + 1], d[b + 2]) }
  for (let y = 0; y < h; y++) { const a = y * w * 4, b = (y * w + w - 1) * 4; push(0, y, d[a], d[a + 1], d[a + 2]); push(w - 1, y, d[b], d[b + 1], d[b + 2]) }
  while (q.length) {   // grow by similarity to the neighbour (handles gradients and soft shadows)
    const i = q.pop()!, x = i % w, y = (i / w) | 0, o = i * 4
    if (x > 0) push(x - 1, y, d[o], d[o + 1], d[o + 2]); if (x < w - 1) push(x + 1, y, d[o], d[o + 1], d[o + 2])
    if (y > 0) push(x, y - 1, d[o], d[o + 1], d[o + 2]); if (y < h - 1) push(x, y + 1, d[o], d[o + 1], d[o + 2])
  }
  for (let i = 0; i < w * h; i++) if (seen[i]) d[i * 4 + 3] = 0
  g.putImageData(im, 0, 0)
  /* soften the edge a touch */
  const s = canvas(w, h), sg = s.getContext('2d')!; sg.filter = 'blur(0.6px)'; sg.drawImage(c, 0, 0)
  return createImageBitmap(s)
}

let ai: Promise<typeof import('@imgly/background-removal')> | null = null
export async function cutOut(file: Blob, onStep?: (s: string) => void): Promise<Cut> {
  const src = await createImageBitmap(file, { imageOrientation: 'from-image' })
  if (hasAlpha(src)) return { bmp: src, method: 'alpha' }
  /* phone photos are huge; the model works at ~1024px anyway */
  const k = Math.min(1, 2000 / Math.max(src.width, src.height))
  const small = canvas(Math.round(src.width * k), Math.round(src.height * k)); small.getContext('2d')!.drawImage(src, 0, 0, small.width, small.height)
  const jpeg = await new Promise<Blob>(r => small.toBlob(b => r(b!), 'image/png'))
  try {
    onStep?.('Removing the background (first time downloads the model, ~40 MB)…')
    ai ??= import('@imgly/background-removal')
    const { removeBackground } = await ai
    const out = await removeBackground(jpeg, { model: 'isnet_quint8', output: { format: 'image/png' }, progress: (key, cur, tot) => { if (/fetch/.test(key) && tot) onStep?.(`Downloading the background model… ${Math.round(cur / tot * 100)}%`) } })
    const bmp = await createImageBitmap(out)
    src.close()
    return { bmp, method: 'ai' }
  } catch (e) {
    console.warn('background model unavailable, using backdrop key', e)
    const bmp = await keyOut(src); src.close()
    return { bmp, method: 'key' }
  }
}

/* alpha bounding box, ignoring specks */
function bbox(bmp: ImageBitmap) {
  const k = Math.min(1, 800 / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
  const c = canvas(w, h), g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(bmp, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h).data
  const col = new Uint32Array(w), row = new Uint32Array(h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 60) { col[x]++; row[y]++ }
  const minC = Math.max(2, h * 0.004), minR = Math.max(2, w * 0.004)
  let x0 = 0, x1 = w - 1, y0 = 0, y1 = h - 1
  while (x0 < x1 && col[x0] < minC) x0++; while (x1 > x0 && col[x1] < minC) x1--
  while (y0 < y1 && row[y0] < minR) y0++; while (y1 > y0 && row[y1] < minR) y1--
  if (x1 - x0 < 4 || y1 - y0 < 4) throw new Error('Could not find the garment in this photo. Try a plainer background.')
  return { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k }
}

/* light, warm grade: lift mids slightly, warm the whites, a touch of contrast */
function grade(g: CanvasRenderingContext2D, w: number, h: number) {
  const im = g.getImageData(0, 0, w, h), d = im.data
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) { const v = i / 255, c = v + 0.06 * Math.sin(Math.PI * v) * (v < 0.5 ? 1 : 0.6); lut[i] = Math.round(255 * Math.min(1, Math.max(0, (c - 0.5) * 1.05 + 0.5))) }
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    d[i] = Math.min(255, lut[d[i]] * 1.04); d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]] * 0.93
  }
  g.putImageData(im, 0, 0)
}

let plate: Promise<ImageBitmap> | null = null
const plateImg = () => plate ??= fetch(new URL('../img/plate.webp', location.href)).then(r => r.blob()).then(b => createImageBitmap(b))

/* place a cut-out on the standard frame. match = the front's placed box (for the back) */
export async function place(c: Cut, n: Nudge, opts: { photo: boolean; match?: { w: number; h: number } }): Promise<Placed> {
  const b = bbox(c.bmp)
  let k = Math.min(CW * MAXW / b.w, CH * MAXH / b.h)
  if (opts.match) k = Math.min(opts.match.h / b.h, opts.match.w * 1.15 / b.w)
  k *= n.s
  const w = b.w * k, h = b.h * k
  const x = (CW - w) / 2 + n.x * CW, y = CH * TOP + n.y * CH
  const cut = canvas(CW, CH), g = cut.getContext('2d', { willReadFrequently: true })!
  g.imageSmoothingQuality = 'high'; g.drawImage(c.bmp, b.x, b.y, b.w, b.h, x, y, w, h)
  grade(g, CW, CH)
  const cutBlob = await toBlob(cut, 0.9)
  const out: Placed = { cut: cutBlob, cutUrl: URL.createObjectURL(cutBlob), blur: '', box: { w, h } }
  const ph = canvas(PW, PH), pg = ph.getContext('2d')!
  if (opts.photo) {
    pg.drawImage(await plateImg(), 0, 0, PW, PH)
    /* soft contact shadow + the garment */
    pg.save(); pg.shadowColor = 'rgba(0,0,0,.55)'; pg.shadowBlur = 40; pg.shadowOffsetY = 18; pg.drawImage(cut, 0, 0, PW, PH); pg.restore()
    pg.drawImage(cut, 0, 0, PW, PH)
    out.photo = await toBlob(ph, 0.86); out.photoUrl = URL.createObjectURL(out.photo)
  } else { pg.fillStyle = '#140a0b'; pg.fillRect(0, 0, PW, PH); pg.drawImage(cut, 0, 0, PW, PH) }
  const s = canvas(12, 16); s.getContext('2d')!.drawImage(ph, 0, 0, 12, 16); out.blur = s.toDataURL('image/webp', 0.5)
  return out
}

/* the raw cut-out (background removed, not placed/graded), kept so nudges can be redone later without re-running removal */
export async function rawBlob(c: Cut) { const b = bbox(c.bmp); const cv = canvas(Math.round(b.w), Math.round(b.h)); cv.getContext('2d')!.drawImage(c.bmp, b.x, b.y, b.w, b.h, 0, 0, cv.width, cv.height); return toBlob(cv, 0.95) }
export async function cutFromUrl(url: string): Promise<Cut> { const r = await fetch(url); if (!r.ok) throw new Error('Could not load the saved cut-out.'); return { bmp: await createImageBitmap(await r.blob()), method: 'alpha' } }
