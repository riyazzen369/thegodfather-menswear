import { useEffect, useRef, useState } from 'react'
import type { Item } from './data'
import { plainVars } from './plain'

/* Inspect a piece: drag to flip. The garment card turns around its vertical axis following the finger 1:1
   (a full card width = 180°), and on release springs to the nearest face, front (0°) or back (180°); a fast fling flips it.
   CSS 3D only (transform + backface-visibility), so it is one composited layer and stays smooth on phones.
   The back is item.back when there is a real photo; otherwise the shared plain back: the piece's own outline,
   mirrored, filled with one plain fabric tone, so every piece reads consistently and nothing is invented. */
export const cutOf = (src: string) => src.replace(/\/img\/([^/]+)\.webp$/, '/img/cut/$1.webp')

export default function Inspect({ item, onClose, onDetails, enquireHref, price, reduced = false }: {
  item: Item; threeD?: boolean; onClose: () => void; onDetails: () => void; enquireHref: string; price: string | null; reduced?: boolean
}) {
  const [shown, setShown] = useState(false)
  const [ready, setReady] = useState(false)
  const [face, setFace] = useState<'front' | 'back'>('front')
  const close = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const st = useRef({ a: 0, v: 0, target: 0, zoom: 1, drag: null as null | { id: number; x: number; a0: number; v: number; t0: number; hist: { x: number; t: number }[] }, pinch: null as null | { d0: number; z0: number }, pts: new Map<number, { x: number; y: number }>(), raf: 0, last: 0 })
  useEffect(() => { const id = requestAnimationFrame(() => { setShown(true); close.current?.focus({ preventScroll: true }) }); return () => cancelAnimationFrame(id) }, [])
  const src = item.cut ?? cutOf(item.images[0].src)
  const backSrc = item.details.plainBack ? undefined : item.back
  /* layout width (unaffected by the rotation), so the drag stays 1:1 as the card foreshortens */
  const W = () => card.current?.offsetWidth || 300

  const paint = () => {
    const s = st.current, el = card.current; if (!el) return
    el.style.transform = `rotateY(${s.a.toFixed(2)}deg) scale(${s.zoom.toFixed(3)})`
    const f = (((Math.round(s.a / 180) % 2) + 2) % 2) ? 'back' : 'front'
    if (el.dataset.face !== f) { el.dataset.face = f; setFace(f) }
  }
  /* critically damped spring to the target face; stops when settled */
  const run = () => {
    const s = st.current
    if (s.raf) return
    s.last = performance.now()
    const step = (n: number) => {
      const dt = Math.min(0.05, (n - s.last) / 1000); s.last = n
      if (!s.drag) {
        const w = 13
        for (let h = dt; h > 0; h -= 1 / 120) { const k = Math.min(h, 1 / 120); s.v += (-2 * w * s.v - w * w * (s.a - s.target)) * k; s.a += s.v * k }
        if (Math.abs(s.a - s.target) < 0.05 && Math.abs(s.v) < 0.5) { s.a = s.target; s.v = 0; paint(); s.raf = 0; return }
      }
      paint(); s.raf = requestAnimationFrame(step)
    }
    s.raf = requestAnimationFrame(step)
  }
  const flipTo = (t: number) => { const s = st.current; s.target = t; if (reduced) { s.a = t; s.v = 0; paint() } else run() }
  const flip = (dir = 1) => flipTo((Math.round(st.current.target / 180) + dir) * 180)
  useEffect(() => () => cancelAnimationFrame(st.current.raf), [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); flip(e.key === 'ArrowRight' ? 1 : -1) }
    }
    document.addEventListener('keydown', key)
    /* test hook: the card's angle (degrees) and face */
    ;(window as any).__inspectFlip = () => ({ a: st.current.a, face: card.current?.dataset.face })
    return () => { document.removeEventListener('keydown', key); delete (window as any).__inspectFlip }
  })

  const down = (e: React.PointerEvent) => {
    const s = st.current; s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    if (s.pts.size === 2) {
      const [p, q] = [...s.pts.values()]; s.pinch = { d0: Math.hypot(p.x - q.x, p.y - q.y), z0: s.zoom }
      if (s.drag) { s.drag = null; flipTo(Math.round(s.a / 180) * 180) }
      return
    }
    s.drag = { id: e.pointerId, x: e.clientX, a0: s.a, v: 0, t0: performance.now(), hist: [{ x: e.clientX, t: performance.now() }] }; s.v = 0; s.target = s.a
    run()
  }
  const move = (e: React.PointerEvent) => {
    const s = st.current; if (!s.pts.has(e.pointerId)) return
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (s.pinch && s.pts.size >= 2) {
      const [p, q] = [...s.pts.values()]; s.zoom = Math.max(1, Math.min(2.4, s.pinch.z0 * Math.hypot(p.x - q.x, p.y - q.y) / s.pinch.d0)); paint(); return
    }
    const d = s.drag; if (!d || d.id !== e.pointerId) return
    /* release velocity from the last ~100 ms of movement (px/ms) */
    const n = performance.now(); d.hist.push({ x: e.clientX, t: n }); while (d.hist.length > 2 && n - d.hist[0].t > 100) d.hist.shift()
    const h0 = d.hist[0]; d.v = n > h0.t ? (e.clientX - h0.x) / (n - h0.t) : 0
    s.a = d.a0 + ((e.clientX - d.x) / W()) * 180
    if (reduced) return
    paint()
  }
  const up = (e: React.PointerEvent) => {
    const s = st.current; s.pts.delete(e.pointerId)
    if (s.pts.size < 2) s.pinch = null
    const d = s.drag; if (!d || d.id !== e.pointerId) return
    s.drag = null
    const moved = Math.abs(e.clientX - d.x)
    /* a fling (fast, even if short) flips to the next face that way; otherwise the nearest face */
    let t = Math.round(s.a / 180) * 180
    const quick = performance.now() - d.t0 < 260 && moved > 36   /* a short flick */
    if (quick && Math.abs(d.v) < 0.1) d.v = Math.sign(e.clientX - d.x) * 0.5
    if ((Math.abs(d.v) > 0.4 && moved > 12 && performance.now() - d.hist[d.hist.length - 1].t < 120) || quick) t = (d.v > 0 ? Math.floor(d.a0 / 180 + 1e-6) + 1 : Math.ceil(d.a0 / 180 - 1e-6) - 1) * 180
    if (reduced) { s.a = moved > 30 || Math.abs(d.v) > 0.5 ? t : d.a0; flipTo(s.a); return }
    s.v = (d.v * 1000 / W()) * 180 * 0.6
    flipTo(t)
  }
  const wheel = (e: React.WheelEvent) => { const s = st.current; s.zoom = Math.max(1, Math.min(2.4, s.zoom * Math.exp(-e.deltaY * 0.0015))); paint() }

  return (
    <div className={`inspect ${shown ? 'open' : ''} ${ready ? 'ready' : ''}`} role="dialog" aria-modal="true" aria-labelledby="inspect-title" id="inspect">
      <div className="inspect-stage flip-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
        <div className="flip-plinth" aria-hidden="true" />
        <div className="flip-card" ref={card} data-face="front">
          <div className="flip-face flip-front">
            <img src={src} alt={`${item.name}, front`} draggable={false} decoding="async" onLoad={() => setReady(true)} onError={() => setReady(true)} />
          </div>
          <div className="flip-face flip-back" aria-hidden={face !== 'back'}>
            {backSrc
              ? <img src={backSrc} alt={`${item.name}, back`} draggable={false} decoding="async" />
              : <div className="flip-plain" role="img" aria-label={`${item.name}, back`} style={{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`, ...plainVars(item.details.plainTone) } as React.CSSProperties} />}
          </div>
        </div>
        <p className="flip-face-label" aria-live="polite"><span className={face === 'front' ? 'on' : ''}>Front</span> / <span className={face === 'back' ? 'on' : ''}>Back</span></p>
      </div>
      <aside className="inspect-panel">
        <p className="inspect-kicker">Elite wardrobe · inspect</p>
        <h2 id="inspect-title">{item.name}</h2>
        <p className="inspect-tag">{item.tagline}</p>
        {price && <p className="inspect-price">{price}</p>}
        <div className="inspect-actions">
          <a className="btn primary" href={enquireHref} target="_blank" rel="noopener" id="inspect-wa">Enquire on WhatsApp</a>
          <button type="button" className="btn ghost" id="inspect-flip" onClick={() => flip(1)} aria-label={face === 'front' ? 'Show the back' : 'Show the front'}>{face === 'front' ? 'Show back' : 'Show front'}</button>
          <button type="button" className="btn ghost" id="inspect-details" onClick={onDetails}>Full details</button>
        </div>
        <p className="inspect-hint">Drag sideways to flip · ← → keys · pinch or scroll to look closer</p>
      </aside>
      <button type="button" className="inspect-close" id="inspect-close" ref={close} onClick={onClose} aria-label="Close and return to the wardrobe">×</button>
    </div>
  )
}
