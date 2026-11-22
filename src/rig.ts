// Shared mutable state between the DOM layer and the 3D scene (no React re-renders per frame).
export type View = 'gate' | 'transition' | 'tailor' | 'walk' | 'wardrobe' | 'grid'
export const TRANSITION_MS = 2500
export const WALK_MS = 6400   // premium: a brisk walk through the shop and hidden wardrobe, a quick stair descent (~3.4s), then the golden vault opening is the highlight
export const rig = {
  view: 'gate' as View,
  gateAt: performance.now(),
  transStart: 0,
  scrollP: 0,            // carousel position in pieces (float)
  index: -1,
  dir: 1,
  activeAt: [] as number[],
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
export const walkTime = () => rig.walkAt ? (rig.walkFreeze ?? (performance.now() - rig.walkAt) / 1000) : -1
