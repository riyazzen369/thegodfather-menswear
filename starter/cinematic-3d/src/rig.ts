/* Shared mutable state between the DOM layer and the 3D scene. Nothing here triggers a React render: the 3D frame loop and the
   rail read and write it every frame. (React state is only for things that change a few times a minute: the active piece, the view.) */
export const rig = {
  p: 0,                                  // rail position in pieces (float): 0 = first piece focused, 1.5 = half way to the third
  index: 0,                              // the focused piece (integer, changes when a swipe is committed)
  pointer: { x: 0, y: 0 },               // -1..1, for the gentle parallax
  layout: { W: 1, H: 1 },                // viewport in CSS px
  quality: 'med' as 'low' | 'med' | 'high',
  fps: 60,
  started: performance.now()             // for the entrance dolly
}
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
export const smooth = (a: number, b: number, t: number) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x) }
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/* ---------- the 360 ring ----------
   Pieces stand on a circle. d = how many pieces a piece is from the focused spot (float, so it flows while dragging).
   STEP is the turn between neighbours: bigger = more dramatic orbit. One function drives every piece, so they all move the same way. */
export const STEP = 0.6                                   // radians between neighbours (~34 degrees)
const SIN = Math.sin(STEP)
export function ringAt(d: number) {
  const a = Math.abs(d), c = Math.min(a, 3), sg = d < 0 ? -1 : 1, th = c * STEP
  return {
    x: sg * (Math.sin(th) / SIN + (a - c) * 0.6),          // sideways, in piece spacings (neighbour = 1)
    z: (1 - Math.cos(th)) / SIN,                            // how far it curves away from the camera, in piece spacings
    th: sg * th                                             // how much it turns towards the middle of the ring
  }
}
/* neighbours are hidden at rest and only appear while a piece is travelling: 1 at the focus, 0 from one piece away.
   Make the second number larger (e.g. 1.6) if you WANT the neighbours visible beside the focused piece. */
export const FADE_END = 0.92
export const ringFade = (a: number) => 1 - smooth(0.3, FADE_END, a)
;(window as any).__rig = rig     // test hook: tests read the live position
