/* The rail: one position p (in pieces) moved by a finger, wheel, keys or buttons, and glided by two critically damped springs in a row.
   Why two? One spring starts at full speed (a jolt). target -> q -> p eases IN as well as out, which is what reads as "fluid".
   Rules that make it feel right: one gesture = one piece, a capped fling speed, ~1 s settle, and p is written once per frame. */
import { rig } from './rig'

export type Rail = ReturnType<typeof createRail>
export function createRail(count: number, onIndex: (i: number) => void) {
  const s = { p: 0, v: 0, q: 0, qv: 0, pl: 0, target: 0, drag: false, last: 0, W: 360 }
  const W_SPRING = 10                       // 10 rad/s on both springs: ~1 s to settle with no overshoot. Lower = slower and floatier.
  const clampI = (i: number) => Math.max(0, Math.min(count - 1, i))
  const goTo = (i: number) => { const n = clampI(i); if (n === s.target && n === rig.index) return; s.target = n; rig.index = n; onIndex(n) }
  /* call once per frame (from the 3D frame loop, or requestAnimationFrame in the 2D fallback) */
  const step = (now: number) => {
    const dt = Math.min(0.25, Math.max(0, (now - (s.last || now)) / 1000)); s.last = now
    if (s.p !== s.pl) { s.q = s.p; s.qv = s.v }                       // something else moved p (the finger): q follows it
    if (!s.drag && (s.p !== s.target || s.v !== 0 || s.q !== s.target || s.qv !== 0)) {
      for (let h = dt; h > 0; h -= 1 / 120) {                          // sub-steps keep it stable on slow frames
        const k = Math.min(h, 1 / 120)
        s.qv += (-2 * W_SPRING * s.qv - W_SPRING * W_SPRING * (s.q - s.target)) * k; s.q += s.qv * k
        s.v += (-2 * W_SPRING * s.v - W_SPRING * W_SPRING * (s.p - s.q)) * k; s.p += s.v * k
      }
      if (Math.abs(s.p - s.target) < 0.0008 && Math.abs(s.v) < 0.01 && Math.abs(s.q - s.target) < 0.0008 && Math.abs(s.qv) < 0.01) { s.p = s.q = s.target; s.v = s.qv = 0 }
    }
    s.pl = s.p
    rig.p = Math.max(0, Math.min(count - 1, s.p))
  }
  /* gestures on any element (bind the root: drags that start on the text panel still turn the ring, vertical drags still scroll the text) */
  const bind = (el: HTMLElement) => {
    let down: null | { x: number; y: number; p0: number; lastX: number; lastT: number; v: number; id: number; axis: 0 | 1 | 2 } = null
    const pdown = (e: PointerEvent) => { if (e.pointerType === 'mouse' && e.button !== 0) return; s.W = el.clientWidth || 360; down = { x: e.clientX, y: e.clientY, p0: s.p, lastX: e.clientX, lastT: performance.now(), v: 0, id: e.pointerId, axis: 0 } }
    const pmove = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return
      const dx = e.clientX - down.x, dy = e.clientY - down.y
      if (down.axis === 0 && Math.hypot(dx, dy) > 6) down.axis = Math.abs(dx) >= Math.abs(dy) ? 1 : 2     // lock to sideways or to vertical scroll
      if (down.axis !== 1) return
      if (!s.drag) { s.drag = true; try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ } }
      const n = performance.now(), dtm = Math.max(1, n - down.lastT)
      down.v = down.v * 0.4 + 0.6 * ((e.clientX - down.lastX) / dtm); down.lastX = e.clientX; down.lastT = n
      s.p = Math.max(-0.25, Math.min(count - 0.75, down.p0 - 0.8 * dx / s.W)); s.v = 0     // 0.8: the piece trails the finger a little (calm, not twitchy)
    }
    const pup = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return
      const d = down; down = null
      if (!s.drag) return
      s.drag = false
      const vpx = performance.now() - d.lastT > 90 ? 0 : d.v, dx = e.clientX - d.x          // px per ms
      let to = rig.index
      if (dx < -50 || vpx < -0.45) to = rig.index + 1; else if (dx > 50 || vpx > 0.45) to = rig.index - 1   // ONE piece per gesture, however hard the flick
      s.v = Math.max(-1.6, Math.min(1.6, -vpx * 1000 / s.W * 0.5))                           // hand the finger's speed to the spring (capped)
      goTo(to)
    }
    let acc = 0, lock = 0
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement)?.closest?.('.panel-scroll') && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) return   // over the text panel the wheel scrolls the text
      e.preventDefault()
      if (performance.now() < lock) return
      acc += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 30 : 1)
      if (Math.abs(acc) >= 30) { goTo(rig.index + (acc > 0 ? 1 : -1)); acc = 0; lock = performance.now() + 800 }
    }
    const key = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return; if (e.key === 'ArrowRight') { e.preventDefault(); goTo(rig.index + 1) } else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(rig.index - 1) } }
    el.addEventListener('pointerdown', pdown); window.addEventListener('pointermove', pmove); window.addEventListener('pointerup', pup); window.addEventListener('pointercancel', pup)
    el.addEventListener('wheel', wheel, { passive: false }); window.addEventListener('keydown', key)
    return () => { el.removeEventListener('pointerdown', pdown); window.removeEventListener('pointermove', pmove); window.removeEventListener('pointerup', pup); window.removeEventListener('pointercancel', pup); el.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key) }
  }
  return { s, step, goTo, bind }
}
