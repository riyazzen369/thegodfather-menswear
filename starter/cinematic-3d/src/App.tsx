/* The page: the whole screen is the gesture surface over the 3D canvas, a text panel that scrolls under the piece, a pinned call-to-action,
   a counter and progress line. If WebGL is missing or fails, a plain scroll-snap carousel takes over (the site always works). */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rig } from './rig'
import { createRail } from './rail'
import { BRAND, PIECES } from './content'

const Scene = lazy(() => import('./three/Scene'))      // the 3D engine is its own chunk: the page paints first, the engine follows
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const pad = (n: number) => String(n).padStart(2, '0')
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false } }

/* ?debug=fps : a small overlay with the frame rate, quality tier and pixel ratio, so a phone screenshot tells you the truth */
function FpsOverlay() {
  const [t, setT] = useState('')
  useEffect(() => { const id = setInterval(() => setT(`${Math.round(rig.fps)} fps · q ${rig.quality} · dpr ${Math.min(devicePixelRatio || 1, { low: 1, med: 1.25, high: 1.75 }[rig.quality])} · piece ${rig.index + 1}`), 500); return () => clearInterval(id) }, [])
  return <div className="fps" aria-hidden="true">{t}</div>
}
export default function App() {
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [mode, setMode] = useState<'3d' | '2d'>(() => (hasWebGL() && !new URLSearchParams(location.search).has('2d') ? '3d' : '2d'))
  const [index, setIndex] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const rail = useMemo(() => createRail(PIECES.length, i => { setIndex(i); try { navigator.vibrate?.(6) } catch { /* no haptics */ } }), [])
  const go = useCallback((i: number) => { rail.goTo(i); if (reduced) { rail.s.p = rail.s.q = rail.s.target; rail.s.v = rail.s.qv = 0 } }, [rail, reduced])
  const fail = useCallback((why: string) => { console.warn('[3d] falling back to 2D:', why); setMode('2d') }, [])

  /* layout + pointer: written to the shared rig, never to React state */
  useEffect(() => {
    const size = () => { rig.layout = { W: innerWidth, H: innerHeight } }; size(); addEventListener('resize', size)
    const pm = (e: PointerEvent) => { rig.pointer.x = (e.clientX / innerWidth) * 2 - 1; rig.pointer.y = -((e.clientY / innerHeight) * 2 - 1) }; addEventListener('pointermove', pm, { passive: true })
    return () => { removeEventListener('resize', size); removeEventListener('pointermove', pm) }
  }, [])
  /* gestures: sideways drag, wheel, arrow keys. The vertical scroll of the text panel is left to the browser (touch-action: pan-y). */
  useEffect(() => (mode === '3d' && root.current ? rail.bind(root.current) : undefined), [mode, rail])
  /* in 2D there is no 3D frame to step the rail, so a light rAF loop does it (nothing is drawn by it) */
  useEffect(() => { if (mode !== '2d') return; let raf = 0; const f = (t: number) => { rail.step(t); raf = requestAnimationFrame(f) }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf) }, [mode, rail])

  const p = PIECES[index]
  return (
    <div className={`app mode-${mode}`} ref={root}>
      {mode === '3d' && <Suspense fallback={null}><Scene rail={rail} reduced={reduced} onFail={fail} /></Suspense>}
      <header className="topbar"><span className="brand">{BRAND.name}</span></header>

      {mode === '3d' ? (
        <section className="panel" aria-live="polite" key={index}>
          <div className="panel-scroll">
            <h1 className="name rise" style={{ '--i': 0 } as React.CSSProperties}>{p.name}</h1>
            <p className="tag rise" style={{ '--i': 1 } as React.CSSProperties}>{p.tagline}</p>
            <p className="desc rise" style={{ '--i': 2 } as React.CSSProperties}>{p.description}</p>
            {p.price != null && <p className="price rise" style={{ '--i': 3 } as React.CSSProperties}>From {inr.format(p.price)}</p>}
            <dl className="specs rise" style={{ '--i': 4 } as React.CSSProperties}>{p.specs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </div>
          <div className="cta"><button type="button" className="btn ghost">Secondary action</button><button type="button" className="btn primary">Primary action</button></div>
        </section>
      ) : (
        <main className="fallback" aria-label="Pieces">
          {PIECES.map(q => <article key={q.name} className="card"><img src={q.image} alt={q.name} /><h2>{q.name}</h2><p>{q.tagline}</p></article>)}
        </main>
      )}

      {mode === '3d' && (
        <>
          <button className="arrow prev" aria-label="Previous piece" disabled={index <= 0} onClick={() => go(index - 1)}>‹</button>
          <button className="arrow next" aria-label="Next piece" disabled={index >= PIECES.length - 1} onClick={() => go(index + 1)}>›</button>
          <footer className="bottombar" aria-hidden="true">
            <span className="counter">{pad(index + 1)} <i>/ {pad(PIECES.length)}</i></span>
            <span className="progress"><b style={{ transform: `scaleX(${(index + 1) / PIECES.length})` }} /></span>
          </footer>
        </>
      )}
      {new URLSearchParams(location.search).get('debug') === 'fps' && <FpsOverlay />}
    </div>
  )
}
