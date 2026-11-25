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
/* Tidy a cut-out so it looks finished: drop the stray specks and fragments the background remover leaves around the subject,
   and (soften) fade the 2px rim where the old backdrop bleeds through as a light halo, then soften the edge a touch. */
export async function cleanCut(bmp: ImageBitmap, soften: boolean): Promise<ImageBitmap> {
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height)), w = Math.max(2, Math.round(bmp.width * k)), h = Math.max(2, Math.round(bmp.height * k)), n = w * h
  const cv = canvas(w, h), g = cv.getContext('2d', { willReadFrequently: true })!; g.drawImage(bmp, 0, 0, w, h)
  const im = g.getImageData(0, 0, w, h), d = im.data
  /* connected pieces of the subject (4-neighbours); keep the big ones */
  const label = new Int32Array(n), stack = new Int32Array(n), sizes: number[] = [0]
  for (let i = 0; i < n; i++) {
    if (label[i] || d[i * 4 + 3] <= 128) continue
    const id = sizes.length; let top = 0, size = 0; stack[top++] = i; label[i] = id
    while (top) {
      const p = stack[--top]; size++; const x = p % w
      if (x > 0 && !label[p - 1] && d[(p - 1) * 4 + 3] > 128) { label[p - 1] = id; stack[top++] = p - 1 }
      if (x < w - 1 && !label[p + 1] && d[(p + 1) * 4 + 3] > 128) { label[p + 1] = id; stack[top++] = p + 1 }
      if (p >= w && !label[p - w] && d[(p - w) * 4 + 3] > 128) { label[p - w] = id; stack[top++] = p - w }
      if (p < n - w && !label[p + w] && d[(p + w) * 4 + 3] > 128) { label[p + w] = id; stack[top++] = p + w }
    }
    sizes.push(size)
  }
  const biggest = Math.max(0, ...sizes), keepMin = Math.max(150, biggest * 0.006)
  const kept = new Uint8Array(n); for (let i = 0; i < n; i++) if (label[i] && sizes[label[i]] >= keepMin) kept[i] = 1
  /* keep soft edge pixels (hair, fabric fringe) that touch a kept piece; everything else goes */
  const near = (m: Uint8Array, r: number) => { let a = m; for (let t = 0; t < r; t++) { const b = new Uint8Array(n); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; b[i] = a[i] | (x > 0 ? a[i - 1] : 0) | (x < w - 1 ? a[i + 1] : 0) | (y > 0 ? a[i - w] : 0) | (y < h - 1 ? a[i + w] : 0) } a = b } return a }
  const region = near(kept, 3)
  for (let i = 0; i < n; i++) if (!region[i]) d[i * 4 + 3] = 0
  if (soften) {
    const inv = new Uint8Array(n); for (let i = 0; i < n; i++) inv[i] = kept[i] ? 0 : 1
    const rim = near(inv, 2)                                  // kept pixels within 2px of the outside
    for (let i = 0; i < n; i++) if (kept[i] && rim[i]) d[i * 4 + 3] = d[i * 4 + 3] * 0.45
    const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = d[i * 4 + 3]
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (a[i] === 255 && a[i - 1] === 255 && a[i + 1] === 255 && a[i - w] === 255 && a[i + w] === 255) continue
      d[i * 4 + 3] = (a[i] * 4 + a[i - 1] + a[i + 1] + a[i - w] + a[i + w] + a[i - w - 1] + a[i - w + 1] + a[i + w - 1] + a[i + w + 1]) / 12 }
  }
  g.putImageData(im, 0, 0)
  return createImageBitmap(cv)
}


/* ---- Matte refinement ---------------------------------------------------------------------------------------------
   The background model returns a soft, low-resolution mask (it works at ~1024px). This sharpens it against the ORIGINAL photo:
   a guided filter makes the mask edge follow the real edges in the picture (hair strands, fingers, shoe soles), then the
   backdrop colour is taken out of the edge pixels so no light halo is left. Only a thin band around the edge is touched. */
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), pre = new Float64Array(Math.max(w, h) + 1)
  for (let y = 0; y < h; y++) {
    const o = y * w; pre[0] = 0
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + src[o + x]
    for (let x = 0; x < w; x++) { const lo = Math.max(0, x - r), hi = Math.min(w - 1, x + r); tmp[o + x] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1) }
  }
  for (let x = 0; x < w; x++) {
    pre[0] = 0
    for (let y = 0; y < h; y++) pre[y + 1] = pre[y] + tmp[y * w + x]
    for (let y = 0; y < h; y++) { const lo = Math.max(0, y - r), hi = Math.min(h - 1, y + r); out[y * w + x] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1) }
  }
  return out
}
export async function refineMatte(photo: ImageBitmap | HTMLCanvasElement, coarse: ImageBitmap): Promise<ImageBitmap> {
  const pw = 'width' in photo ? photo.width : 0, ph = 'height' in photo ? photo.height : 0
  const k = Math.min(1, 1800 / Math.max(pw, ph)), w = Math.max(2, Math.round(pw * k)), h = Math.max(2, Math.round(ph * k)), n = w * h
  const cg = canvas(w, h).getContext('2d', { willReadFrequently: true })!; cg.drawImage(photo, 0, 0, w, h)
  const img = cg.getImageData(0, 0, w, h), d = img.data
  const ag = canvas(w, h).getContext('2d', { willReadFrequently: true })!; ag.drawImage(coarse, 0, 0, w, h)
  const ad = ag.getImageData(0, 0, w, h).data
  const I = new Float32Array(n), P = new Float32Array(n), bin = new Float32Array(n)
  for (let i = 0; i < n; i++) { I[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255; P[i] = ad[i * 4 + 3] / 255; bin[i] = P[i] > 0.5 ? 1 : 0 }
  const r = Math.max(4, Math.round(Math.max(w, h) / 220)), eps = 2e-4
  const mI = boxMean(I, w, h, r), mP = boxMean(P, w, h, r)
  const Ip = new Float32Array(n), II = new Float32Array(n); for (let i = 0; i < n; i++) { Ip[i] = I[i] * P[i]; II[i] = I[i] * I[i] }
  const cIp = boxMean(Ip, w, h, r), cII = boxMean(II, w, h, r)
  const A = new Float32Array(n), B = new Float32Array(n)
  for (let i = 0; i < n; i++) { const v = cII[i] - mI[i] * mI[i], c = cIp[i] - mI[i] * mP[i]; A[i] = c / (v + eps); B[i] = mP[i] - A[i] * mI[i] }
  const mA = boxMean(A, w, h, r), mB = boxMean(B, w, h, r)
  /* only the band around the coarse edge is refined; flat areas keep the model's decision */
  const band = boxMean(bin, w, h, r * 2)
  const al = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (band[i] < 0.01) { al[i] = 0; continue }
    if (band[i] > 0.99) { al[i] = 1; continue }
    const q = mA[i] * I[i] + mB[i], t = Math.min(1, Math.max(0, (q - 0.3) / 0.4)); al[i] = t * t * (3 - 2 * t)
  }
  /* backdrop colour near each edge pixel (from the pixels the mask calls background), then un-mix it: F = (I - (1-a)·B) / a */
  const bgm = new Float32Array(n); for (let i = 0; i < n; i++) bgm[i] = al[i] < 0.02 && band[i] < 0.99 ? 1 : 0
  const rd = r * 3, wB = boxMean(bgm, w, h, rd), cr = new Float32Array(n), cgc = new Float32Array(n), cb = new Float32Array(n)
  for (let i = 0; i < n; i++) if (bgm[i]) { cr[i] = d[i * 4]; cgc[i] = d[i * 4 + 1]; cb[i] = d[i * 4 + 2] }
  const mr = boxMean(cr, w, h, rd), mg = boxMean(cgc, w, h, rd), mb = boxMean(cb, w, h, rd)
  for (let i = 0; i < n; i++) {
    const a = al[i], o = i * 4
    if (a > 0.02 && a < 0.98 && wB[i] > 0.02) {
      const br = mr[i] / wB[i], bg = mg[i] / wB[i], bb = mb[i] / wB[i], aa = Math.max(a, 0.35)
      d[o] = Math.max(0, Math.min(255, (d[o] - (1 - a) * br) / aa)); d[o + 1] = Math.max(0, Math.min(255, (d[o + 1] - (1 - a) * bg) / aa)); d[o + 2] = Math.max(0, Math.min(255, (d[o + 2] - (1 - a) * bb) / aa))
    }
    d[o + 3] = a < 0.04 ? 0 : Math.round(a * 255)
  }
  cg.putImageData(img, 0, 0)
  return createImageBitmap(cg.canvas)
}

export type RawCut = { bmp: ImageBitmap; method: Cut['method']; photo: HTMLCanvasElement | null }
/* background removal + matte refinement, WITHOUT the final tidy: the Attire editor needs the raw result to let you fix it.
   photo = the original pixels (kept so a removed part can be brought back); null when the upload was already a transparent cut-out. */
export async function cutOutRaw(file: Blob, onStep?: (s: string) => void): Promise<RawCut> {
  const src = await createImageBitmap(file, { imageOrientation: 'from-image' })
  if (hasAlpha(src)) return { bmp: src, method: 'alpha', photo: null }
  /* phone photos are huge; the model works at ~1024px anyway */
  const k = Math.min(1, 2000 / Math.max(src.width, src.height))
  const small = canvas(Math.round(src.width * k), Math.round(src.height * k)); small.getContext('2d')!.drawImage(src, 0, 0, small.width, small.height)
  const jpeg = await new Promise<Blob>(r => small.toBlob(b => r(b!), 'image/png'))
  try {
    onStep?.('Removing the background (first time downloads the model, ~90 MB)…')
    ai ??= import('@imgly/background-removal')
    const { removeBackground } = await ai
    const run = (model: 'isnet_fp16' | 'isnet_quint8') => removeBackground(jpeg, { model, output: { format: 'image/png' }, progress: (key, cur, tot) => { if (/fetch/.test(key) && tot) onStep?.(`Downloading the background model… ${Math.round(cur / tot * 100)}%`) } })
    /* the larger, more accurate model first; the small one if that cannot load */
    const out = await run('isnet_fp16').catch(() => run('isnet_quint8'))
    onStep?.('Sharpening the edges…')
    const bmp = await refineMatte(small, await createImageBitmap(out))
    src.close()
    return { bmp, method: 'ai', photo: small }
  } catch (e) {
    console.warn('background model unavailable, using backdrop key', e)
    const bmp = await refineMatte(src, await keyOut(src))
    const ph = canvas(Math.round(src.width * k), Math.round(src.height * k)); ph.getContext('2d')!.drawImage(src, 0, 0, ph.width, ph.height)
    return { bmp, method: 'key', photo: ph }
  }
}
export async function cutOut(file: Blob, onStep?: (s: string) => void): Promise<Cut> {
  const r = await cutOutRaw(file, onStep)
  return { bmp: await cleanCut(r.bmp, false), method: r.method }
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
/* where the garment's bounding box lands on the 1200x1600 canvas for a nudge */
function rectOf(c: Cut, n: Nudge, match?: { w: number; h: number }, box?: { x: number; y: number; w: number; h: number }) {
  const b = box ?? bbox(c.bmp)
  let k = Math.min(CW * MAXW / b.w, CH * MAXH / b.h)
  if (match) k = Math.min(match.h / b.h, match.w * 1.15 / b.w)
  k *= n.s
  const w = b.w * k, h = b.h * k
  return { b, w, h, x: (CW - w) / 2 + n.x * CW, y: CH * TOP + n.y * CH }
}
export async function place(c: Cut, n: Nudge, opts: { photo: boolean; match?: { w: number; h: number }; maxBytes?: number }): Promise<Placed> {
  const { b, w, h, x, y } = rectOf(c, n, opts.match)
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
    /* compress as hard as it takes to stay under maxBytes, but never below q 0.72 (visible loss starts under that) */
    let q = opts.maxBytes ? 0.88 : 0.86; out.photo = await toBlob(ph, q)
    while (opts.maxBytes && out.photo.size > opts.maxBytes && q > 0.72) { q = Math.max(0.72, q - 0.04); out.photo = await toBlob(ph, q) }
    out.photoUrl = URL.createObjectURL(out.photo)
  } else { pg.fillStyle = '#140a0b'; pg.fillRect(0, 0, PW, PH); pg.drawImage(cut, 0, 0, PW, PH) }
  const s = canvas(12, 16); s.getContext('2d')!.drawImage(ph, 0, 0, 12, 16); out.blur = s.toDataURL('image/webp', 0.5)
  return out
}

/* the raw cut-out (background removed, not placed/graded), kept so nudges can be redone later without re-running removal */
export async function rawBlob(c: Cut) { const b = bbox(c.bmp); const cv = canvas(Math.round(b.w), Math.round(b.h)); cv.getContext('2d')!.drawImage(c.bmp, b.x, b.y, b.w, b.h, 0, 0, cv.width, cv.height); return toBlob(cv, 0.95) }
export async function cutFromUrl(url: string): Promise<Cut> { const r = await fetch(url); if (!r.ok) throw new Error('Could not load the saved cut-out.'); return { bmp: await createImageBitmap(await r.blob()), method: 'alpha' } }

/* The plain back: the colour a piece is made in, read from its front cut-out. Looks at the chest area, ignores skin tones and
   near-transparent edges, and takes the most common colour. Returns '#rrggbb'. */
export async function toneFromUrl(url: string): Promise<string> {
  const r = await fetch(url); if (!r.ok) throw new Error('Could not load the photo')
  const bmp = await createImageBitmap(await r.blob())
  const W = 64, H = Math.max(8, Math.round(64 * bmp.height / bmp.width)), cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })!; g.drawImage(bmp, 0, 0, W, H)
  const px = g.getImageData(Math.round(W * .22), Math.round(H * .28), Math.round(W * .56), Math.round(H * .32)).data
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < px.length; i += 4) {
    const [R, G, B, A] = [px[i], px[i + 1], px[i + 2], px[i + 3]]
    if (A < 200) continue
    const skin = R > 95 && G > 40 && B > 20 && R > G && R > B && R - Math.min(G, B) > 15 && Math.abs(R - G) > 12 && R - B > 25 && R < 250 && G / R > .45 && G / R < .85
    if (skin) continue
    const k = (R >> 5) << 6 | (G >> 5) << 3 | (B >> 5), e = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++; e.r += R; e.g += G; e.b += B; bins.set(k, e)
  }
  let best = { n: 0, r: 42, g: 35, b: 31 }
  for (const e of bins.values()) if (e.n > best.n) best = e
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${h(best.r / best.n || best.r)}${h(best.g / best.n || best.g)}${h(best.b / best.n || best.b)}`
}

/* ---- Auto fit: line the back up with the front -------------------------------------------------------------------
   Both cut-outs are turned into low-resolution silhouettes on the same canvas grid. The back's size and position
   (the same Size / Left-right / Up-down nudges you would use by hand) are searched to give the largest overlap with the
   front silhouette, so after a flip the head, shoulders and hem sit where they were. Pure computation, runs in the browser. */
const G = 10, GW = CW / G, GH = CH / G
function subjectMask(c: Cut, b: { x: number; y: number; w: number; h: number }, max = 200) {
  const k = max / Math.max(b.w, b.h), w = Math.max(2, Math.round(b.w * k)), h = Math.max(2, Math.round(b.h * k))
  const cv = canvas(w, h), g = cv.getContext('2d', { willReadFrequently: true })!; g.drawImage(c.bmp, b.x, b.y, b.w, b.h, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h)
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 110 ? 1 : 0
  return { m, w, h }
}
function gridOf(mask: { m: Uint8Array; w: number; h: number }, r: { x: number; y: number; w: number; h: number }) {
  const out = new Uint8Array(GW * GH); let n = 0
  const gx0 = Math.max(0, Math.floor(r.x / G)), gx1 = Math.min(GW - 1, Math.ceil((r.x + r.w) / G)), gy0 = Math.max(0, Math.floor(r.y / G)), gy1 = Math.min(GH - 1, Math.ceil((r.y + r.h) / G))
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const u = Math.floor(((gx + .5) * G - r.x) / r.w * mask.w), v = Math.floor(((gy + .5) * G - r.y) / r.h * mask.h)
    if (u >= 0 && v >= 0 && u < mask.w && v < mask.h && mask.m[v * mask.w + u]) { out[gy * GW + gx] = 1; n++ }
  }
  return { g: out, n }
}
export function autoFit(front: Cut, fn: Nudge, back: Cut): { nudge: Nudge; score: number } {
  const fr = rectOf(front, fn), fg = gridOf(subjectMask(front, fr.b), fr)
  const match = { w: fr.w, h: fr.h }, bb = rectOf(back, NUDGE0, match).b, bm = subjectMask(back, bb)
  const iou = (n: Nudge) => {
    const r = rectOf(back, n, match, bb), bg = gridOf(bm, r); let inter = 0
    for (let i = 0; i < fg.g.length; i++) if (fg.g[i] && bg.g[i]) inter++
    return inter / (fg.n + bg.n - inter || 1)
  }
  const clampN = (n: Nudge): Nudge => ({ s: Math.min(1.4, Math.max(0.6, n.s)), x: Math.min(0.2, Math.max(-0.2, n.x)), y: Math.min(0.2, Math.max(-0.2, n.y)) })
  let best = { n: { ...NUDGE0 }, v: iou(NUDGE0) }
  const sweep = (c: Nudge, ds: number, dx: number, dy: number, rs: number, rx: number, ry: number) => {
    for (let s = -rs; s <= rs + 1e-9; s += ds) for (let x = -rx; x <= rx + 1e-9; x += dx) for (let y = -ry; y <= ry + 1e-9; y += dy) {
      const n = clampN({ s: c.s + s, x: c.x + x, y: c.y + y }), v = iou(n); if (v > best.v) best = { n, v }
    }
  }
  sweep({ s: 1, x: 0, y: 0 }, 0.05, 0.02, 0.02, 0.4, 0.2, 0.2)          // coarse: everywhere the sliders reach
  sweep(best.n, 0.01, 0.004, 0.004, 0.05, 0.02, 0.02)                    // fine: around the best
  sweep(best.n, 0.004, 0.0015, 0.0015, 0.012, 0.005, 0.005)              // finest
  const r = (v: number) => Math.round(v * 1000) / 1000
  return { nudge: { s: r(best.n.s), x: r(best.n.x), y: r(best.n.y) }, score: best.v }
}
