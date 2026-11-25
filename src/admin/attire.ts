/* Attire photo pipeline: pick the garment out of a busy photo, let the owner correct it, and prepare the finished themed photo.
   Everything runs in the browser. The editable state keeps the original pixels, the model's raw matte and a list of fixes. */
import { cleanCut, type Cut, type RawCut } from './normalize'

export type Comp = { id: number; area: number; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }
export type Stroke = { x: number; y: number; r: number; add: boolean }          // normalised: x,y in 0..1 of width/height, r as a fraction of the long side
export type EditState = {
  w: number; h: number
  rgb: Uint8ClampedArray              // RGBA of the original photo (or of the supplied cut-out)
  auto: Uint8Array                    // the model's matte, untouched
  labels: Int32Array                  // connected pieces of the matte (0 = none)
  comps: Comp[]
  include: number[]                   // piece ids kept
  strokes: Stroke[]
  canRestore: boolean                 // false when the upload was already a transparent cut-out (no original pixels to bring back)
  method: RawCut['method']
}

/* connected pieces (4-neighbours) of everything the model marked as foreground */
export function components(alpha: Uint8Array, w: number, h: number) {
  const n = w * h, labels = new Int32Array(n), stack = new Int32Array(n), comps: Comp[] = []
  for (let i = 0; i < n; i++) {
    if (labels[i] || alpha[i] <= 128) continue
    const id = comps.length + 1; let top = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, sx = 0, sy = 0
    stack[top++] = i; labels[i] = id
    while (top) {
      const p = stack[--top], x = p % w, y = (p - x) / w; area++; sx += x; sy += y
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      if (x > 0 && !labels[p - 1] && alpha[p - 1] > 128) { labels[p - 1] = id; stack[top++] = p - 1 }
      if (x < w - 1 && !labels[p + 1] && alpha[p + 1] > 128) { labels[p + 1] = id; stack[top++] = p + 1 }
      if (y > 0 && !labels[p - w] && alpha[p - w] > 128) { labels[p - w] = id; stack[top++] = p - w }
      if (y < h - 1 && !labels[p + w] && alpha[p + w] > 128) { labels[p + w] = id; stack[top++] = p + w }
    }
    comps.push({ id, area, x0, y0, x1, y1, cx: sx / area, cy: sy / area })
  }
  return { labels, comps }
}

/* The garment is the big, central piece. Pieces that actually touch it, or sit a hair away (a hanger, shoes, a sleeve split by a gap), go with it;
   everything else in the frame (a chair, a bag, another garment on the rail) is left out, and the owner can tap to change that. */
export function autoSelect(comps: Comp[], labels: Int32Array, w: number, h: number): number[] {
  if (!comps.length) return []
  const minArea = Math.max(120, Math.max(...comps.map(c => c.area)) * 0.004)
  const real = comps.filter(c => c.area >= minArea)
  const score = (c: Comp) => c.area * (1 - 0.65 * Math.hypot((c.cx / w - 0.5) * 1.1, (c.cy / h - 0.5)))
  const main = real.reduce((a, b) => score(b) > score(a) ? b : a)
  if (real.length === 1) return [main.id]
  /* pixels within r of the main piece (separable box dilation with running sums) */
  const r = Math.max(3, Math.round(Math.max(w, h) * 0.02)), n = w * h
  const row = new Uint8Array(n), near = new Uint8Array(n), cnt = new Int32Array(Math.max(w, h) + 1)
  for (let y = 0; y < h; y++) { cnt[0] = 0; for (let x = 0; x < w; x++) cnt[x + 1] = cnt[x] + (labels[y * w + x] === main.id ? 1 : 0); for (let x = 0; x < w; x++) row[y * w + x] = cnt[Math.min(w, x + r + 1)] - cnt[Math.max(0, x - r)] > 0 ? 1 : 0 }
  for (let x = 0; x < w; x++) { cnt[0] = 0; for (let y = 0; y < h; y++) cnt[y + 1] = cnt[y] + row[y * w + x]; for (let y = 0; y < h; y++) near[y * w + x] = cnt[Math.min(h, y + r + 1)] - cnt[Math.max(0, y - r)] > 0 ? 1 : 0 }
  const touch = new Set<number>(); for (let i = 0; i < n; i++) if (near[i] && labels[i] && labels[i] !== main.id) touch.add(labels[i])
  return [main.id, ...real.filter(c => touch.has(c.id)).map(c => c.id)]
}

export function buildState(raw: RawCut, size = 1800): EditState {
  const k = Math.min(1, size / Math.max(raw.bmp.width, raw.bmp.height)), w = Math.max(2, Math.round(raw.bmp.width * k)), h = Math.max(2, Math.round(raw.bmp.height * k))
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const g = cv.getContext('2d', { willReadFrequently: true })!; g.drawImage(raw.bmp, 0, 0, w, h)
  const cut = g.getImageData(0, 0, w, h).data
  const auto = new Uint8Array(w * h); for (let i = 0; i < auto.length; i++) auto[i] = cut[i * 4 + 3]
  let rgb = cut
  if (raw.photo) { g.clearRect(0, 0, w, h); g.drawImage(raw.photo, 0, 0, w, h); rgb = g.getImageData(0, 0, w, h).data }
  const { labels, comps } = components(auto, w, h)
  return { w, h, rgb, auto, labels, comps, include: autoSelect(comps, labels, w, h), strokes: [], canRestore: !!raw.photo, method: raw.method }
}

/* the matte after the selection and the fixes: pieces kept, then brush strokes in order */
export function currentAlpha(st: EditState, scale = 1): { alpha: Uint8ClampedArray; w: number; h: number } {
  const w = Math.max(2, Math.round(st.w * scale)), h = Math.max(2, Math.round(st.h * scale)), out = new Uint8ClampedArray(w * h)
  const keep = new Set(st.include)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(st.h - 1, Math.floor(y / scale)) * st.w
    for (let x = 0; x < w; x++) { const si = sy + Math.min(st.w - 1, Math.floor(x / scale)); if (keep.has(st.labels[si])) out[y * w + x] = st.auto[si] }
  }
  const long = Math.max(w, h)
  for (const s of st.strokes) {
    const cx = s.x * w, cy = s.y * h, r = Math.max(1, s.r * long), r2 = r * r, soft = r * 0.35
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2; if (d2 > r2) continue
      const f = Math.min(1, (r - Math.sqrt(d2)) / soft), i = y * w + x      // soft edge on the brush
      out[i] = s.add ? Math.max(out[i], Math.round(255 * f)) : Math.round(out[i] * (1 - f))
    }
  }
  return { alpha: out, w, h }
}

/* the finished cut-out, ready for place(): original colours where the matte says garment */
export async function toCut(st: EditState): Promise<Cut> {
  const { alpha } = currentAlpha(st)
  const cv = document.createElement('canvas'); cv.width = st.w; cv.height = st.h
  const g = cv.getContext('2d', { willReadFrequently: true })!, im = g.createImageData(st.w, st.h)
  im.data.set(st.rgb); for (let i = 0; i < alpha.length; i++) im.data[i * 4 + 3] = alpha[i]
  g.putImageData(im, 0, 0)
  const bmp = await createImageBitmap(cv)
  /* with no manual fixes also drop stray specks; with fixes, keep exactly what the owner made */
  return { bmp: st.strokes.length ? bmp : await cleanCut(bmp, false), method: 'alpha' }
}

/* plain-language checks shown under a slot */
export function warnings(st: EditState): string[] {
  const { alpha, w, h } = currentAlpha(st, 0.25), n = w * h, out: string[] = []
  let area = 0, minX = w, maxX = 0, minY = h, maxY = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[y * w + x] > 128) { area++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  if (!area) return ['Nothing is selected. Tap "Fix cut-out" and tap the garment, or use the brush.']
  if (area / n < 0.03) out.push('The garment is very small in this photo. A closer photo gives a sharper result.')
  const edge = (cond: (x: number, y: number) => boolean) => { let c = 0, t = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cond(x, y)) { t++; if (alpha[y * w + x] > 128) c++ } return c / Math.max(1, t) }
  if (maxX - minX > 6 && (edge((x) => x <= 1) > 0.06 || edge((x) => x >= w - 2) > 0.06 || edge((_, y) => y <= 1) > 0.06 || edge((_, y) => y >= h - 2) > 0.06)) out.push('The garment touches the edge of the photo, so part of it may be cut off.')
  const left = st.comps.filter(c => !st.include.includes(c.id) && c.area > st.w * st.h * 0.004).length
  if (left) out.push(`${left} other object${left === 1 ? ' was' : 's were'} left out. Tap "Fix cut-out" if the garment is missing a part.`)
  if (st.method === 'key') out.push('The cut-out model could not load (no connection?), so a simple method was used. Check the edges, or try again online.')
  return out
}

/* a 512 px WebP copy for the grid card */
export async function smallCopy(photo: Blob): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(photo), w = 512, h = Math.round(bmp.height * w / bmp.width), c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    return await new Promise<Blob | null>(res => c.toBlob(b => res(b), 'image/webp', 0.8))
  } catch { return null }
}
export const kb = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
