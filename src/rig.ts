// Shared mutable state between the DOM layer and the 3D scene (no React re-renders per frame).
export type View = 'gate' | 'transition' | 'tailor' | 'walk' | 'wardrobe' | 'grid'
export const TRANSITION_MS = 2500
export const WALK_MS = 6400   // the walk's own clock (its choreography is written in these seconds)
export const WALK_REAL_MS = 5400   // how long it really lasts: the choreography plays WALK_MS/WALK_REAL_MS times faster
export const WALK_SPEED = WALK_MS / WALK_REAL_MS
// premium: a brisk walk through the shop and hidden wardrobe, a quick stair descent, then the golden vault opening is the highlight
export const rig = {
  view: 'gate' as View,
  gateAt: performance.now(),
  transStart: 0,
  scrollP: 0,            // carousel position in pieces (float)
  index: -1,
  dir: 1,
  activeAt: [] as number[],
  railV: 0,                // rail velocity in pieces per second (smoothed): the scene leans, glows and drifts with it
  idle: false,             // true while the vault is at rest and the scene draws at a lower rate
  photoK: [] as number[],   // 0..1 per piece: how much of its photo the 3D scene is drawing (the DOM picture covers the rest)
  loadUpTo: 1,
  pointer: { x: 0, y: 0 },
  over: 0,               // drag overscroll in px (edge resistance)
  nudgeAt: 0, nudgeDir: 0,
  layout: { W: 1, H: 1, sx: 0.5, sy: 0.35, sw: 0.8, sh: 0.5, slideW: 1, v: 0 },
  fps: 0,
  low: false,
  quality: 'auto-high' as string,
  dpr: 1,
  snap: false,
  railStep: null as null | ((now: number) => void),   // the wardrobe rail, stepped from the 3D frame when it runs
  glStepAt: 0,
  descentAt: 0,          // when the camera started descending into the vault
  walkAt: 0,             // when the premium walk-in started (0 = not walking)
  /* debug: ?freeze=1.3 holds the transition at that second (for screenshots) */
  /* debug: ?wfreeze=4.2 holds the premium walk at that second */
  walkFreeze: (() => { const f = new URLSearchParams(location.search).get('wfreeze'); return f ? +f : null })() as number | null,
  freeze: (() => { const f = new URLSearchParams(location.search).get('freeze'); return f ? +f : null })() as number | null
}
;(window as any).__rig = rig
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
export const smooth = (a: number, b: number, t: number) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x) }

/* seconds into the premium walk, or -1 when not walking */
export const walkTime = () => rig.walkAt ? (rig.walkFreeze ?? (performance.now() - rig.walkAt) / 1000 * WALK_SPEED) : -1

/* ---------- 360 orbit: the wardrobe pieces sit on a ring around the viewer ----------
   d = how many pieces a piece is from the focused spot (float, so it flows while dragging). One shared function drives both the
   3D niches and the DOM pictures, so they stay locked together and every piece moves, turns and scales exactly the same way. */
export const ORBIT_STEP = 0.6                                  // radians between neighbours on the ring (~34 degrees)
const ORBIT_SIN = Math.sin(ORBIT_STEP)
export const ORBIT_TAN = Math.tan(20 * Math.PI / 180)          // half of the 40 degree camera lens
export function orbitAt(d: number) {
  const a = Math.abs(d), c = Math.min(a, 3), sg = d < 0 ? -1 : 1, th = c * ORBIT_STEP
  return {
    x: sg * (Math.sin(th) / ORBIT_SIN + (a - c) * 0.6),         // sideways, in piece spacings (neighbour = 1)
    z: (1 - Math.cos(th)) / ORBIT_SIN,                           // how far it curves back, in piece spacings
    th: sg * th                                                  // turn towards the centre of the ring
  }
}
/* neighbours are hidden at rest and only appear while a piece is travelling: 1 at the focus, 0 from one piece away */
export const orbitFade = (a: number) => 1 - smooth(0.3, 0.92, a)
const lastT = new WeakMap<HTMLElement, string>()
/* the words of a piece stay put and cross-fade while the rail turns (they used to slide sideways half-cut across the screen) */
const copyOf = new WeakMap<HTMLElement, HTMLElement | null>()
const lastC = new WeakMap<HTMLElement, string>()
const copyEl = (el: HTMLElement) => { let c = copyOf.get(el); if (c === undefined) { c = (el.parentElement?.querySelector('.copy') as HTMLElement | null) ?? null; copyOf.set(el, c) } return c }
export function clearOrbitCopy() { document.querySelectorAll<HTMLElement>('.track .copy').forEach(c => { c.style.transform = ''; c.style.opacity = ''; lastC.delete(c) }) }
/* place the DOM pictures (the .stage of each slide) on the ring. p = the focused position in pieces; n = how many pieces (the final slide is left alone) */
export function applyOrbit(stages: HTMLElement[], p: number, n: number, use3d = false) {
  const L = rig.layout, W = L.W
  const pw = Math.min(L.sh, L.sw * 4 / 3) * 0.75
  const pitch = (0.92 * W - L.sx) + pw * 0.34
  const Dpx = L.H / (2 * ORBIT_TAN)
  for (let i = 0; i < n && i < stages.length; i++) {
    const el = stages[i], d = i - p, a = Math.abs(d)
    const cp = copyEl(el)
    if (cp) {
      const cf = a > 1.2 ? 0 : 1 - smooth(0.06, 0.5, a), ck = cf.toFixed(3) + '|' + (a < 0.002 ? 0 : ((i - rig.scrollP) * L.slideW).toFixed(1))
      if (lastC.get(cp) !== ck) { lastC.set(cp, ck); cp.style.opacity = cf >= 0.999 ? '' : ck.split('|')[0]; cp.style.transform = a < 0.002 ? '' : `translate3d(${(-(i - rig.scrollP) * L.slideW).toFixed(1)}px,0,0)` }
    }
    if (a > 2.5) { if (lastT.get(el) !== '') { el.style.transform = ''; el.style.removeProperty('--dim'); el.style.zIndex = ''; el.style.opacity = ''; lastT.set(el, '') } continue }
    /* the 3D scene is drawing this piece's photo in full: its HTML picture only needs to sit still, invisible, as the tap target.
       Skipping the per-frame transform work here keeps the main thread free while the ring turns. */
    if (use3d && (rig.photoK[i] || 0) >= 0.999) {
      const hide = orbitFade(a) < 0.01, k3 = hide ? 'k3h' : 'k3'
      if (lastT.get(el) !== k3) { lastT.set(el, k3); el.style.transform = ''; el.style.opacity = '0'; el.style.visibility = hide ? 'hidden' : ''; el.style.zIndex = ''; el.style.removeProperty('--dim') }
      continue
    }
    const o = orbitAt(d), k = Dpx / (Dpx + o.z * pitch)
    const tx = (W / 2 + (o.x * pitch + L.sx - W / 2) * k) - (L.sx + (i - rig.scrollP) * L.slideW)
    const tr = a < 0.002 ? '' : `translate3d(${tx.toFixed(2)}px,0,0) perspective(1300px) rotateY(${(o.th * 180 / Math.PI).toFixed(2)}deg) scale(${k.toFixed(4)})`
    const key = tr + '|' + a.toFixed(3) + '|' + (use3d ? (rig.photoK[i] || 0).toFixed(2) : '-')
    if (lastT.get(el) === key) continue
    lastT.set(el, key)
    el.style.transform = tr
    el.style.setProperty('--dim', (Math.min(1, a / 1.15) * 0.62).toFixed(3))
    el.style.zIndex = String(20 - Math.round(a * 6))
    const f = orbitFade(a), pk = use3d ? (rig.photoK[i] || 0) : 0, op = f * (1 - pk)
    el.style.opacity = op >= 0.999 ? '' : op.toFixed(3); el.style.visibility = f < 0.01 ? 'hidden' : ''
  }
}
