import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { withElite } from './Elite'
import { CHOICES, HOST, STORE, TAILOR, greeting, type Choice } from './data'
import Rain from './Rain'
import { Mark } from './Pic'

/* The storefront: the rainy shop at night, and Lorenzo, your host.
   phase 'in'   lights flicker on, the camera eases in, Lorenzo rises into frame and the line types out
         'out'  a plain fade (attire tour, or any route under reduced motion)
         'lead' the camera rushes through the glass doors, past the wooden slats, into the private room,
                where the wardrobe doors slide open on the gold light of the vault below
   quick = repeat visit / called back from the top bar: same scene, shorter build-up. */
type Nav = 'collections' | 'tailoring' | 'visit' | 'private'
export default function Tailor({ phase, quick, reduced, onChoose, onNav }: {
  phase: 'in' | 'out' | 'lead' | 'walk'
  quick: boolean
  reduced: boolean
  onChoose: (c: Choice) => void
  onNav: (n: Nav) => void
}) {
  const line = useRef(greeting()).current
  const [typed, setTyped] = useState(reduced ? line.length : 0)
  const [done, setDone] = useState(reduced)
  const stopped = useRef(false)
  const root = useRef<HTMLElement>(null), head = useRef<HTMLDivElement>(null), plate = useRef<HTMLDivElement>(null)
  const T = quick ? { host: 0.25, panel: 0.55, type: 0.8, cps: 70 } : { host: 3.0, panel: 3.4, type: 3.9, cps: 42 }

  /* the photo plate covers the screen like object-fit: cover, so the neon/door/floor overlays line up with it */
  useLayoutEffect(() => {
    const fit = () => {
      const W = innerWidth, H = innerHeight, s = Math.max(W / 1920, H / 1080), w = 1920 * s, h = 1080 * s
      const el = plate.current!; el.style.width = w + 'px'; el.style.height = h + 'px'
      /* portrait phones: keep the sign and the doors in frame */
      el.style.left = (W - w) * (W / H < 1 ? 0.52 : 0.5) + 'px'; el.style.top = (H - h) / 2 + 'px'
    }
    fit(); addEventListener('resize', fit); return () => removeEventListener('resize', fit)
  }, [])

  /* typewriter (the full sentence is always available to screen readers) */
  useEffect(() => {
    if (reduced) return
    let raf = 0; const t0 = performance.now() + T.type * 1000
    const step = (t: number) => {
      if (stopped.current) return
      const n = Math.max(0, Math.min(line.length, Math.floor((t - t0) / 1000 * T.cps)))
      setTyped(n)
      if (n < line.length) raf = requestAnimationFrame(step); else setDone(true)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])
  const finish = () => { stopped.current = true; setTyped(line.length); setDone(true); root.current?.classList.add('instant') }
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !done) finish() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [done])
  useEffect(() => { head.current?.focus({ preventScroll: true }) }, [])

  /* depth parallax: photo, host and front rain move by different amounts */
  useEffect(() => {
    if (reduced) return
    const el = root.current!
    const pm = (e: PointerEvent) => { el.style.setProperty('--px', String((e.clientX / innerWidth - 0.5) * 2)); el.style.setProperty('--py', String((e.clientY / innerHeight - 0.5) * 2)) }
    addEventListener('pointermove', pm); return () => removeEventListener('pointermove', pm)
  }, [])

  const words = line.slice(0, typed)
  const store = STORE(Math.max(innerWidth, innerHeight * 16 / 9) * Math.min(2, devicePixelRatio || 1))
  return (
    <section ref={root} className={`tailor sf ${quick ? 'quick' : ''} ${phase === 'out' ? 'closing' : ''} ${phase === 'lead' ? 'leading' : ''} ${phase === 'walk' ? 'walking' : ''} ${done ? 'typed' : ''}`}
      id="tailor" aria-labelledby="host-line" aria-busy={phase !== 'in'}
      style={{ '--t-host': T.host + 's', '--t-panel': T.panel + 's' } as React.CSSProperties}>
      <div className="sf-cam" aria-hidden="true">
        <div className="sf-plate" ref={plate}>
          <img className="sf-photo" src={store} alt="" decoding="async" />
          <img className="sf-neon glow" src={store} alt="" decoding="async" />
          <img className="sf-neon" src={store} alt="" decoding="async" />
          <img className="sf-wet" src={store} alt="" decoding="async" />
          <div className="sf-door" />
        </div>
        <Rain layer="back" floor={0.78} paused={reduced} />
      </div>
      <div className="sf-shade" aria-hidden="true" />

      {/* Lorenzo: cigar ember + smoke and the cat's blink are their own small layers over the photo */}
      <div className="sf-host" aria-hidden="true">
        <div className="host-fig">
          <img src={TAILOR.host} srcSet={TAILOR.hostSet} sizes="(max-width:959px) 260px, 460px" alt="" width={654} height={1248} decoding="async" />
          <i className="cat-lid l" /><i className="cat-lid r" />
          <i className="cig-ember" />
          {!reduced && <span className="cig-smoke">{[0, 1, 2, 3, 4].map(k => <i key={k} style={{ '--k': k } as React.CSSProperties} />)}</span>}
        </div>
      </div>
      {!reduced && <Rain layer="front" floor={1} />}

      <header className="sf-nav">
        <span className="sf-logo" role="img" aria-label="The Godfather"><Mark sizes="(min-width:960px) 78px, 64px" /></span>
        <nav aria-label="Main">
          <button type="button" id="nav-collections" onClick={() => onNav('collections')}>Collections</button>
          <button type="button" id="nav-tailoring" onClick={() => onNav('tailoring')}>Tailoring</button>
          <button type="button" id="nav-visit" onClick={() => onNav('visit')}>Visit</button>
          <button type="button" id="nav-private" onClick={() => onNav('private')}>Elite wardrobe</button>
        </nav>
      </header>

      <div className="sf-hero">
        <p className="sf-kicker"><i aria-hidden="true" />Night boutique · Bespoke tailoring</p>
        <h1 className="sf-title">Dressed for the <em>family</em> business.</h1>
        <p className="sf-sub">Suits cut to measure, shirts with nerve, and an Elite wardrobe for those who know the password.</p>
      </div>

      <div className="sf-panel">
        <p className="sf-who"><b>{HOST.name}</b> · {HOST.role}</p>
        <div className="sf-say" ref={head} tabIndex={-1}>
          <p className="sr-only" id="host-line">{line}</p>
          <p className="sf-line" aria-hidden="true">{words}<span className={`caret ${done ? 'off' : ''}`} /></p>
        </div>
        <ul className="sf-choices" aria-label="Choose where to go">
          {CHOICES.map(c => (
            <li key={c.id}>
              <button type="button" className={`sf-choice ${c.id}`} id={`choice-${c.id}`} onClick={() => onChoose(c)}>
                <span><b>{withElite(c.label)}</b><small>{c.note}</small></span>
                <svg viewBox="0 0 20 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M1 6h17M13 1l5 5-5 5" /></svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {!done && <button className="skip" id="tailor-skip" type="button" onClick={finish}>Skip</button>}

      {/* the way down (premium) */}
      <div className="sf-slats" aria-hidden="true" />
      <div className="sf-red" aria-hidden="true" />
      <div className="sf-room" aria-hidden="true">
        <div className="sf-curtain l" style={{ backgroundImage: `url(${TAILOR.curtain})` }} />
        <div className="sf-curtain r" style={{ backgroundImage: `url(${TAILOR.curtain})` }} />
        <div className="sf-wardrobe"><div className="wd-gold" /><div className="wd-door l"><i /></div><div className="wd-door r"><i /></div></div>
        <div className="sf-uplight l" /><div className="sf-uplight r" />
      </div>
      <div className="t-gold" aria-hidden="true" />
    </section>
  )
}
