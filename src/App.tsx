import { CartButton, CartDrawer, ShopBuy } from './Shop'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { withElite } from './Elite'
import { WA_ICON, CALL_ICON } from './icons'
import { CONTACT, ITEMS, SAMPLE_PRICES, STORE, TAILOR, vaultCount, onCatalogue, type Item, type Choice } from './data'
import Pic, { Mark, preloadPic } from './Pic'
import Tailor from './Tailor'
import Grid from './Grid'
import { rig, TRANSITION_MS, WALK_MS } from './rig'

const Experience = lazy(() => import('./three/Experience'))
const Inspect = lazy(() => import('./Inspect'))

/* vault size: the premium pieces. Re-read when the live catalogue changes (the app is remounted then). */
let N = vaultCount(), LAST = N
onCatalogue(() => { N = vaultCount(); LAST = N })
/* ?debug=fps: a small overlay with frame rate, quality level, pixel ratio and the GPU watchdog (for tuning on real GPUs) */
const DEBUG_FPS = new URLSearchParams(location.search).get('debug') === 'fps'
function FpsOverlay({ mode }: { mode: string }) {
  const [t, setT] = useState('')
  useEffect(() => {
    let f = 0, last = performance.now(), raf = 0, min = 999
    const loop = () => { f++; const n = performance.now(); if (n - last >= 1000) { const fps = Math.round(f * 1000 / (n - last)); min = Math.min(min, fps); f = 0; last = n
      const g = (window as any).__glHealth
      setT(`${fps} fps (min ${min}) · ${mode} · q ${mode === '3d' ? rig.quality + (rig.low ? ' (low)' : '') : '-'} · dpr ${rig.dpr} · ${rig.view}${g ? ' · gl ' + g.max : ''}`) }
      raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf)
  }, [mode])
  return <div className="fps-debug" aria-hidden="true">{t}</div>
}
/* rendered width of a wardrobe piece: 3:4 inside the stage (46% of the slide on desktop) */
const GARMENT_SIZES = '(min-width:960px) min(34vw, calc(75vh - 170px)), min(66vw, calc(56vh - 100px))'
const pad = (n: number) => String(n).padStart(2, '0')
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const wa = (text: string) => `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`
const BOOK_HREF = CONTACT.bookingUrl || wa('Hello, I would like to book a fitting.')
const enquire = (it: Item) => wa(`Hello, I would like to enquire about the ${it.name}.`)
const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* private mode */ } }
}
function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

const Chev = ({ d }: { d: 'l' | 'r' }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={d === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></svg>

export default function App(_: { rev?: number }) {
  const reduced = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches).current
  const [mode, setMode] = useState<'3d' | '2d'>(() => (!reduced && webglOK() && !new URLSearchParams(location.search).has('2d')) ? '3d' : '2d')
  const is3D = mode === '3d'
  const [arrive, setArrive] = useState(false)
  /* start the 3D scene once the gate's logo has faded in, so loading it can't stutter the first second */
  const [glMount, setGlMount] = useState(false)
  /* the premium wardrobe has no published pieces: say so instead of opening an empty vault */
  const [outOfStock, setOutOfStock] = useState(false)
  /* the 3D engine (~360 kB) is not needed to paint the gate or the storefront: it starts after the page has settled
     (load + idle), or the moment the visitor first touches the page, whichever comes first */
  useEffect(() => {
    let done = false, id = 0
    const go = () => { if (done) return; done = true; clearTimeout(id); ev.forEach(e => removeEventListener(e, go)); setGlMount(true) }
    const ev = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const
    ev.forEach(e => addEventListener(e, go, { once: true, passive: true }))
    const arm = () => { id = window.setTimeout(() => { const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }; if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2500 }); else go() }, viewRef.current === 'gate' ? 1200 : 2000) }
    if (document.readyState === 'complete') arm(); else addEventListener('load', arm, { once: true })
    return () => { done = true; clearTimeout(id); ev.forEach(e => removeEventListener(e, go)); removeEventListener('load', arm) }
  }, [])
  const [view, setViewState] = useState<'gate' | 'transition' | 'tailor' | 'walk' | 'wardrobe' | 'grid'>(() => store.get('gf-entered') ? 'tailor' : 'gate')
  const viewRef = useRef(view)
  const setView = (v: typeof view) => { viewRef.current = v; rig.view = v; setViewState(v) }
  const [index, setIndexState] = useState(-1)
  const indexRef = useRef(-1)
  const [sheet, setSheet] = useState<number | null>(null)
  /* inspect: the selected piece in 3D on a turntable */
  const [inspect, setInspect] = useState<number | null>(null)
  const inspectRef = useRef<number | null>(null)
  const inspectFrom = useRef<HTMLElement | null>(null)
  const [sheetShown, setSheetShown] = useState(false)
  const sheetRef = useRef<number | null>(null)
  const [sound, setSound] = useState(false)
  const [gateKey, setGateKey] = useState(0)
  const [fadeBlack, setFadeBlack] = useState(false)
  type Phase = 'off' | 'in' | 'out' | 'lead' | 'walk'
  const [tailor, setTailor] = useState<Phase>(() => store.get('gf-entered') ? 'in' : 'off')
  const tailorRef = useRef<Phase>(tailor)
  const setTailorPhase = (p: Phase) => { tailorRef.current = p; setTailor(p) }
  const [tailorQuick, setTailorQuick] = useState(() => !!store.get('gf-entered'))
  const [gridCat, setGridCat] = useState<string>('all')

  const track = useRef<HTMLDivElement>(null)
  const live = useRef<HTMLDivElement>(null)
  const crest = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const enterTimers = useRef<number[]>([])

  rig.view = viewRef.current
  const slides = () => [...(track.current?.querySelectorAll<HTMLElement>('.slide') ?? [])]

  /* ---------- layout for the 3D scene ---------- */
  const measure = useCallback(() => {
    const s = slides()[0]; if (!s) return
    const st = s.querySelector('.stage') as HTMLElement
    const sr = s.getBoundingClientRect(), r = st.getBoundingClientRect()
    rig.layout = { W: innerWidth, H: innerHeight, sx: r.left - sr.left + r.width / 2, sy: r.top + r.height / 2, sw: r.width, sh: r.height, slideW: s.offsetWidth, v: rig.layout.v + 1 }
  }, [])
  useLayoutEffect(() => { measure() })
  /* the on-screen width of a wardrobe piece (CSS px), for picking image sizes ahead of time */
  const garmentW = () => { const L = rig.layout; return Math.min(L.sh, L.sw * 4 / 3) * 0.75 || 400 }
  /* Every piece of the vault is fetched and decoded in the background (nearest first) as soon as the walk starts, so sliding never waits for a picture. */
  const [warm, setWarm] = useState(false)
  useEffect(() => {
    if (view !== 'walk' && view !== 'wardrobe') { setWarm(false); return }
    let dead = false, k = 0
    const from = Math.max(0, indexRef.current), n = vaultCount()
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - from) - Math.abs(b - from))
    const step = () => {
      if (dead) return
      if (k >= order.length) { setWarm(true); return }
      const it = ITEMS[order[k++]]; if (it?.images[0]) preloadPic(it.images[0].src, garmentW())
      window.setTimeout(step, 90)
    }
    const t = window.setTimeout(step, 400)
    return () => { dead = true; clearTimeout(t) }
  }, [view])  // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- carousel ---------- */
  const setActive = useCallback((i: number, dir = 1, force = false) => {
    if (i === indexRef.current && !force) return
    const prev = indexRef.current
    indexRef.current = i; rig.index = i; rig.dir = dir
    rig.activeAt[i] = performance.now()
    rig.loadUpTo = Math.max(rig.loadUpTo, i + 1)
    setIndexState(i)
    const ss = slides()
    const s = ss[i]
    if (s) { s.style.setProperty('--from', (dir >= 0 ? 10 : -10) + '%'); s.classList.remove('is-active'); void s.offsetWidth; s.classList.add('is-active') }
    ss.forEach((el, k) => { if (k !== i) el.classList.remove('is-active') })
    if (live.current) live.current.textContent = i === LAST ? 'The wardrobe is private. Visit us or book a fitting.' : `Item ${i + 1} of ${N}. ${ITEMS[i].name}.`
    if (prev !== -1 && ss[prev] && ss[prev].contains(document.activeElement)) track.current?.focus({ preventScroll: true })
  }, [])

  const nudge = (dir: number) => {
    if (reduced) return
    rig.nudgeAt = performance.now(); rig.nudgeDir = dir
    track.current?.animate([{ transform: 'none' }, { transform: `translateX(${-dir * 26}px)` }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.3,.7,.3,1)' })
  }
  /* ---- the rail: one position p (in pieces), moved by a critically damped spring or by the finger, written once per frame.
     The track no longer scrolls natively: we set scrollLeft in the same frame the 3D camera and the DOM pieces are placed,
     so pictures and gold niches can never drift apart (that drift was the stutter). Nothing re-renders while it moves. */
  const car = useRef({ p: 0, v: 0, target: 0, drag: false, last: 0, W: 1, maxP: LAST, wrote: -1 })
  const railMeasure = useCallback(() => {
    const t = track.current, s0 = slides()[0]; if (!t || !s0) return
    const c = car.current; c.W = s0.offsetWidth || 1; c.maxP = Math.max(0, (t.scrollWidth - t.clientWidth) / c.W)
  }, [])
  const railJump = useCallback((i: number) => {
    const c = car.current; railMeasure(); c.p = c.target = Math.min(i, c.maxP); c.v = 0; c.wrote = -1
    const t = track.current; if (t) { t.scrollLeft = c.p * c.W; c.wrote = t.scrollLeft }
    rig.scrollP = c.p
  }, [railMeasure])
  const railStep = useCallback((now: number) => {
    const c = car.current, t = track.current; if (!t) return
    let dt = (now - c.last) / 1000; c.last = now
    if (dt <= 0) return
    dt = Math.min(dt, 0.25) /* keep real-time pace on slow frames; sub-steps keep it stable */
    if (!c.drag && (c.p !== c.target || c.v !== 0)) {
      /* critically damped spring (~0.5 s to settle), sub-stepped for stability */
      const w = 11
      for (let h = dt; h > 0; h -= 1 / 120) {
        const k = Math.min(h, 1 / 120), a = -2 * w * c.v - w * w * (c.p - c.target)
        c.v += a * k; c.p += c.v * k
      }
      if (Math.abs(c.p - c.target) < 0.0008 && Math.abs(c.v) < 0.01) { c.p = c.target; c.v = 0 }
    }
    const left = Math.max(0, Math.min(c.maxP, c.p)) * c.W
    if (Math.abs(left - c.wrote) > 0.05) { t.scrollLeft = left; c.wrote = left }
    rig.scrollP = Math.max(0, Math.min(c.maxP, c.p))
  }, [])
  /* 3D drives the rail from its own frame (before the camera and pictures are placed); this loop covers 2D and paused GL */
  useEffect(() => {
    rig.railStep = railStep
    let raf = 0
    const loop = (n: number) => { if (n - rig.glStepAt > 40) railStep(n); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); rig.railStep = null }
  }, [railStep])
  const goTo = useCallback((i: number, instant = false) => {
    if (i < 0 || i > LAST) { nudge(i < 0 ? -1 : 1); return }
    const c = car.current; railMeasure()
    const dir = Math.sign(i - indexRef.current) || 1
    c.target = Math.min(i, c.maxP)
    if (instant || reduced) { c.p = c.target; c.v = 0 }
    /* the neighbours of where we are going are decoded before they slide in */
    for (const k of [i - 1, i + 1]) if (k >= 0 && k < LAST) preloadPic(ITEMS[k].images[0].src, garmentW())
    setActive(i, dir)
  }, [setActive, railMeasure])

  useEffect(() => {
    const t = track.current!
    let moved = false
    let down: null | { x: number; y: number; p0: number; base: number; lastX: number; lastT: number; v: number; id: number; axis: 0 | 1 | 2 } = null
    /* focus or the browser moving the track on its own (it can't be scrolled by the user any more): adopt it */
    const onScroll = () => {
      const c = car.current
      if (c.drag || Math.abs(t.scrollLeft - c.wrote) < 1.5) return
      c.p = t.scrollLeft / c.W; c.wrote = t.scrollLeft
      const n = Math.max(0, Math.min(LAST, Math.round(c.p))); c.target = Math.min(n, c.maxP)
      if (n !== indexRef.current) setActive(n, Math.sign(n - indexRef.current))
    }
    t.addEventListener('scroll', onScroll, { passive: true })
    const pdown = (e: PointerEvent) => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || sheetRef.current !== null || inspectRef.current !== null || viewRef.current !== 'wardrobe') return
      railMeasure()
      const c = car.current
      down = { x: e.clientX, y: e.clientY, p0: c.p, base: indexRef.current, lastX: e.clientX, lastT: performance.now(), v: 0, id: e.pointerId, axis: 0 }; moved = false
    }
    const pmove = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return
      const dx = e.clientX - down.x, dy = e.clientY - down.y
      if (down.axis === 0 && Math.hypot(dx, dy) > 6) down.axis = Math.abs(dx) >= Math.abs(dy) ? 1 : 2
      if (down.axis !== 1) return
      const c = car.current
      if (!c.drag) { c.drag = true; moved = true; t.classList.add('dragging'); try { t.setPointerCapture(e.pointerId) } catch { /* noop */ } }
      const n = performance.now(), dtm = Math.max(1, n - down.lastT)
      down.v = down.v * 0.4 + 0.6 * ((e.clientX - down.lastX) / dtm); down.lastX = e.clientX; down.lastT = n
      let want = down.p0 - dx / c.W, over = 0
      if (want < 0) { over = want * c.W; want = 0 } else if (want > c.maxP) { over = (want - c.maxP) * c.W; want = c.maxP }
      c.p = want; c.v = 0; rig.over = over
      t.style.transform = over ? `translate3d(${(-over * 0.3).toFixed(1)}px,0,0)` : ''
    }
    const pup = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return
      const d = down; down = null
      const c = car.current
      if (!c.drag) return
      c.drag = false; rig.over = 0; t.classList.remove('dragging')
      if (t.style.transform) { t.animate([{ transform: t.style.transform }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.7,.2,1)' }); t.style.transform = '' }
      const vpx = performance.now() - d.lastT > 90 ? 0 : d.v            // px per ms
      const dx = e.clientX - d.x
      let to = d.base
      if (dx < -50 || vpx < -0.4) to = d.base + 1; else if (dx > 50 || vpx > 0.4) to = d.base - 1
      to = Math.max(0, Math.min(LAST, to))
      /* hand the finger's speed to the spring, so the glide continues the gesture instead of restarting */
      c.v = Math.max(-8, Math.min(8, -vpx * 1000 / c.W))
      c.target = Math.min(to, c.maxP)
      if (reduced) { c.p = c.target; c.v = 0 }
      if (to !== indexRef.current) { for (const k of [to - 1, to + 1]) if (k >= 0 && k < LAST) preloadPic(ITEMS[k].images[0].src, garmentW()); setActive(to, Math.sign(to - d.base) || 1) }
    }
    const click = (e: MouseEvent) => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return }
      const s = (e.target as HTMLElement).closest('.slide') as HTMLElement | null
      if (s && +s.dataset.i! !== indexRef.current) { e.preventDefault(); goTo(+s.dataset.i!) }
      /* a tap on the piece in focus opens it in 3D */
      else if (s && (e.target as HTMLElement).closest('.garment')) { e.preventDefault(); openInspect(+s.dataset.i!, s.querySelector('.details') as HTMLElement | null) }
    }
    t.addEventListener('pointerdown', pdown)
    window.addEventListener('pointermove', pmove)
    window.addEventListener('pointerup', pup)
    window.addEventListener('pointercancel', pup)
    t.addEventListener('click', click, true)

    /* wheel + trackpad: one gesture = one piece */
    let acc = 0, lock = false, quietT = 0, lockT = 0
    const tryUnlock = () => { acc = 0; const left = lockT - performance.now(); if (left <= 0) lock = false; else quietT = window.setTimeout(tryUnlock, left) }
    const wheel = (e: WheelEvent) => {
      if (viewRef.current !== 'wardrobe' || sheetRef.current !== null || inspectRef.current !== null) return
      e.preventDefault()
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      clearTimeout(quietT); quietT = window.setTimeout(tryUnlock, 160)
      if (lock) return
      acc += e.deltaMode === 1 ? d * 30 : d
      if (Math.abs(acc) >= 30) { const dir = acc > 0 ? 1 : -1; acc = 0; lock = true; lockT = performance.now() + 650; goTo(indexRef.current + dir) }
    }
    window.addEventListener('wheel', wheel, { passive: false })
    const resize = () => { measure(); railMeasure(); if (indexRef.current >= 0) railJump(indexRef.current) }
    window.addEventListener('resize', resize)
    return () => {
      t.removeEventListener('scroll', onScroll)
      t.removeEventListener('pointerdown', pdown); window.removeEventListener('pointermove', pmove)
      window.removeEventListener('pointerup', pup); window.removeEventListener('pointercancel', pup)
      t.removeEventListener('click', click, true); window.removeEventListener('wheel', wheel); window.removeEventListener('resize', resize)
    }
  }, [goTo, setActive, measure, railMeasure, railJump])

  /* ---------- pointer + gyro (gate parallax, red ring) ---------- */
  const ring = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const pm = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && ring.current) ring.current.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`
      rig.pointer.x = (e.clientX / innerWidth) * 2 - 1; rig.pointer.y = -((e.clientY / innerHeight) * 2 - 1)
      if (viewRef.current === 'wardrobe') tilt()
    }
    let tiltQ = 0
    const tilt = () => { if (tiltQ) return; tiltQ = requestAnimationFrame(() => { tiltQ = 0; const t = track.current; if (t) { t.style.setProperty('--px', rig.pointer.x.toFixed(3)); t.style.setProperty('--py', rig.pointer.y.toFixed(3)) } }) }
    const ori = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      rig.pointer.x = Math.max(-1, Math.min(1, e.gamma / 25)); rig.pointer.y = Math.max(-1, Math.min(1, (45 - e.beta) / 25))
    }
    window.addEventListener('pointermove', pm)
    window.addEventListener('deviceorientation', ori)
    return () => { window.removeEventListener('pointermove', pm); window.removeEventListener('deviceorientation', ori) }
  }, [])

  /* ---------- gate -> transition -> wardrobe ---------- */
  /* after the entry, the tailor greets you before the wardrobe */
  const showTailor = useCallback(() => {
    enterTimers.current.forEach(clearTimeout); enterTimers.current = []
    if (sheetRef.current !== null) closeSheet(true)
    indexRef.current = -1; rig.index = -1
    slides().forEach(s => s.classList.remove('is-active'))
    setView('tailor'); setTailorPhase('in')
  }, [])
  const callTailor = useCallback(() => { setTailorQuick(true); showTailor() }, [showTailor])
  const finishEnter = useCallback(() => {
    if (viewRef.current !== 'transition') return
    setTailorQuick(false); showTailor()
  }, [showTailor])
  /* into the golden bunker: put the wardrobe rail at `target`, start the camera descent */
  const openVault = useCallback((target = 0, descent = true) => {
    const t = track.current!, ss = slides()
    void t; void ss
    railJump(target); rig.snap = true
    rig.descentAt = descent && !reduced ? performance.now() : 0
    setView('wardrobe'); setActive(target, 1, true)
    track.current?.focus({ preventScroll: true })
  }, [setActive, reduced, railJump])
  const toGrid = useCallback((cat = 'all') => {
    setGridCat(cat); setView('grid')
    requestAnimationFrame(() => { const g = document.getElementById('grid'); if (g) g.scrollTop = 0; document.getElementById('grid-title')?.focus({ preventScroll: true }) })
  }, [])
  /* premium walk-in (3D): the camera follows one spline; the wardrobe takes over as it settles on the first anchor */
  const walkTimers = useRef<number[]>([])
  const arriveT = useRef(0)
  const landed = useCallback(() => {
    walkTimers.current.forEach(clearTimeout); walkTimers.current = []
    openVault(0, false)
    setArrive(true); clearTimeout(arriveT.current); arriveT.current = window.setTimeout(() => setArrive(false), 1500)
  }, [openVault])
  const startWalk = useCallback(() => {
    walkTimers.current.forEach(clearTimeout); walkTimers.current = []
    const t = track.current!
    void t; railJump(0)
    indexRef.current = -1; rig.index = -1
    slides().forEach(s => s.classList.remove('is-active'))
    rig.descentAt = 0; rig.walkAt = performance.now()
    setView('walk')
    /* the vault is fetched while we walk: first pieces at the size they will be shown */
    const w = garmentW()
    ITEMS.slice(0, 3).forEach(it => preloadPic(it.images[0].src, w))
    walkTimers.current.push(window.setTimeout(() => { if (viewRef.current === 'walk') landed() }, WALK_MS - 650))
  }, [landed])
  const skipWalk = useCallback(() => {
    if (viewRef.current !== 'walk') return
    walkTimers.current.forEach(clearTimeout); walkTimers.current = []
    setFadeBlack(true)
    window.setTimeout(() => { rig.walkAt = 0; landed(); setFadeBlack(false) }, 320)
  }, [landed])
  /* if the GPU can't draw the scene (context lost, black frames, a crawl), carry on in the 2D room */
  const glFail = useCallback((why: string) => {
    console.warn('[godfather] switching to the 2D room:', why)
    rig.walkAt = 0
    setMode('2d')
    if (viewRef.current === 'walk') landed()
  }, [landed])
  /* the shopkeeper's choices */
  const leaveTailor = useCallback((to: 'premium' | 'tour' | 'skip' | 'visit') => {
    if (viewRef.current !== 'tailor' || tailorRef.current !== 'in') return
    if (to === 'premium' && vaultCount() === 0) { setOutOfStock(true); return }
    if (to === 'premium' && !reduced && is3D) {
      /* one continuous first-person walk: through the doors, past the racks, the hidden wardrobe, down into the vault */
      setTailorPhase('walk'); startWalk()
      window.setTimeout(() => setTailorPhase('off'), 1500)
      return
    }
    if (to === 'premium' && !reduced) {
      /* 2D: through the glass doors, past the slats, into the private room; the wardrobe opens and we go down into the vault */
      setTailorPhase('lead')
      window.setTimeout(() => openVault(0, true), 3300)
      window.setTimeout(() => setTailorPhase('off'), 3950)
      return
    }
    setTailorPhase('out')
    window.setTimeout(() => {
      if (to === 'tour') toGrid()
      else if (to === 'visit') openVault(LAST, false)
      else openVault(0, to === 'premium')
      window.setTimeout(() => setTailorPhase('off'), reduced ? 320 : 520)
    }, reduced ? 0 : 480)
  }, [openVault, toGrid, reduced, is3D, startWalk])
  const choose = useCallback((c: Choice) => leaveTailor(c.id), [leaveTailor])
  const hostNav = useCallback((n: 'collections' | 'visit' | 'private') =>
    leaveTailor(n === 'collections' ? 'tour' : n === 'private' ? 'premium' : n), [leaveTailor])
  /* from the attire tour straight down to the vault */
  const gridToVault = useCallback(() => {
    if (vaultCount() === 0) { setOutOfStock(true); return }
    if (sheetRef.current !== null) closeSheet(true)
    setFadeBlack(true)
    window.setTimeout(() => { if (is3D && !reduced) startWalk(); else openVault(0, true); setFadeBlack(false) }, reduced ? 150 : 380)
  }, [openVault, reduced, is3D, startWalk])
  const enter = useCallback(() => {
    if (viewRef.current !== 'gate') return
    store.set('gf-entered', '1')
    const t = track.current!
    void t; railJump(0)
    indexRef.current = -1; rig.index = -1
    slides().forEach(s => s.classList.remove('is-active'))
    rig.transStart = performance.now()
    setView('transition')
    if (reduced || !is3D) {
      enterTimers.current.push(window.setTimeout(finishEnter, reduced ? 450 : 1400))
    } else if (rig.freeze == null) {
      /* the tailor fades in as the dolly comes through the curtains (the last ~0.6s of the 2.5s entry) */
      enterTimers.current.push(window.setTimeout(finishEnter, TRANSITION_MS - 600))
    }
  }, [finishEnter, setActive, is3D, reduced])

  const toGate = useCallback(() => {
    if (sheetRef.current !== null) closeSheet(true)
    setFadeBlack(true)
    window.setTimeout(() => {
      rig.gateAt = performance.now()
      setView('gate'); setGateKey(k => k + 1)
      setFadeBlack(false)
      crest.current?.focus({ preventScroll: true })
    }, reduced ? 150 : 380)
  }, [reduced])

  /* first load: refresh in the same session goes straight to the wardrobe */
  useEffect(() => {
    rig.view = viewRef.current
    rig.gateAt = performance.now()
  }, [])

  /* ---------- warm the cache for the next scenes while the gate is up ---------- */
  useEffect(() => {
    const pre = (u: string) => { const i = new Image(); i.decoding = 'async'; i.src = u; i.decode?.().catch(() => {}) }
    /* wait until the storefront has painted (load + idle): the next scenes must never compete with the first paint */
    const t = window.setTimeout(() => {
      pre(STORE(Math.max(innerWidth, innerHeight * 16 / 9) * Math.min(2, devicePixelRatio || 1)))
      pre(TAILOR.host); pre(TAILOR.curtain); window.setTimeout(() => pre(TAILOR.walk), 1500)
      const est = innerWidth >= 960 ? Math.min(innerWidth * 0.34, innerHeight * 0.75 - 170) : Math.min(innerWidth * 0.66, innerHeight * 0.56 - 100)
      ITEMS.slice(0, 3).forEach(it => preloadPic(it.images[0].src, est))
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.getElementById('cart')) return   /* the cart drawer owns the keyboard while open */
      if (inspectRef.current !== null && sheetRef.current === null) {
        if (e.key === 'Escape') { e.preventDefault(); closeInspect() }
        else if (e.key === 'Tab') { const d = document.getElementById('inspect'); const f = d ? Array.from(d.querySelectorAll<HTMLElement>('a,button')) : []; if (f.length) { const i = f.indexOf(document.activeElement as HTMLElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus() } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus() } } }
        return
      }
      if (sheetRef.current !== null) {
        if (e.key === 'Escape') { e.preventDefault(); closeSheet() }
        else if (e.key === 'Tab') trapFocus(e)
        return
      }
      const v = viewRef.current
      if (v === 'gate' && (e.key === 'Enter' || e.key === ' ') && document.activeElement === document.body) { e.preventDefault(); enter(); return }
      if (v === 'transition' && e.key === 'Escape') { finishEnter(); return }
      if (v === 'walk' && e.key === 'Escape') { skipWalk(); return }
      if (v === 'tailor') return  /* Esc there finishes the intro (handled in Tailor) */
      if (v !== 'wardrobe') return
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(indexRef.current + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(indexRef.current - 1) }
      else if (e.key === 'Home') { e.preventDefault(); goTo(0) }
      else if (e.key === 'End') { e.preventDefault(); goTo(LAST) }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [enter, finishEnter, goTo, leaveTailor, skipWalk])

  /* ---------- sound: soft low room tone, off by default ---------- */
  const audio = useRef<{ ac: AudioContext; master: GainNode } | null>(null)
  const toggleSound = () => {
    if (!audio.current) {
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)()
      const master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination)
      const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0)
      let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2 }
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220
      src.connect(lp).connect(master); src.start()
      const hum = ac.createOscillator(); hum.frequency.value = 55; const hg = ac.createGain(); hg.gain.value = 0.05
      hum.connect(hg).connect(master); hum.start()
      audio.current = { ac, master }
    }
    const { ac, master } = audio.current
    const on = !sound
    if (ac.state === 'suspended') ac.resume()
    master.gain.cancelScheduledValues(ac.currentTime); master.gain.setTargetAtTime(on ? 0.35 : 0, ac.currentTime, 0.6)
    setSound(on)
  }

  /* ---------- detail sheet ---------- */
  const sheetEl = useRef<HTMLElement>(null), gallery = useRef<HTMLDivElement>(null), sheetBody = useRef<HTMLDivElement>(null)
  const [gIdx, setGIdx] = useState(0)
  const closeT = useRef(0), openRaf = useRef<number[]>([]), openedAt = useRef(0)
  const openInspect = (i: number, opener: HTMLElement | null) => {
    if (i < 0 || i >= ITEMS.length || inspectRef.current !== null) return
    inspectFrom.current = opener; inspectRef.current = i; setInspect(i)
  }
  function closeInspect(then?: () => void) {
    if (inspectRef.current === null) return
    const el = document.getElementById('inspect'); el?.classList.add('closing')
    inspectRef.current = null
    window.setTimeout(() => { setInspect(null); if (then) then(); else inspectFrom.current?.focus({ preventScroll: true }) }, reduced ? 200 : 380)
  }
  const openSheet = (i: number, opener: HTMLElement) => {
    clearTimeout(closeT.current)
    returnFocus.current = opener
    sheetRef.current = i; setSheet(i); setGIdx(0)
    openedAt.current = performance.now()
    openRaf.current.forEach(cancelAnimationFrame)
    openRaf.current = [requestAnimationFrame(() => { openRaf.current = [requestAnimationFrame(() => {
      if (sheetRef.current !== i) return /* closed again before it finished opening: stay closed (else the page stays inert) */
      setSheetShown(true)
      if (gallery.current) gallery.current.scrollLeft = 0
      if (sheetBody.current) sheetBody.current.scrollTop = 0
      setTimeout(() => (document.getElementById('close') as HTMLElement)?.focus({ preventScroll: true }), 60)
    })] })]
  }
  function closeSheet(instant = false) {
    if (sheetRef.current === null) return
    sheetRef.current = null
    openRaf.current.forEach(cancelAnimationFrame); openRaf.current = []
    setSheetShown(false)
    if (sheetEl.current) { sheetEl.current.classList.remove('dragging'); sheetEl.current.style.transform = '' }
    if (instant) setSheet(null); else closeT.current = window.setTimeout(() => setSheet(null), reduced ? 320 : 560)
    const rf = returnFocus.current
    if (rf && (viewRef.current === 'wardrobe' || viewRef.current === 'grid')) { rf.focus({ preventScroll: true }); setTimeout(() => rf.focus({ preventScroll: true }), 0); requestAnimationFrame(() => rf.focus({ preventScroll: true })) }
  }
  function trapFocus(e: KeyboardEvent) {
    const f = [...(sheetEl.current?.querySelectorAll<HTMLElement>('a[href],button,[tabindex]:not([tabindex="-1"])') ?? [])].filter(el => el.offsetParent !== null)
    if (!f.length) return
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  const isBottomSheet = () => !matchMedia('(min-width:900px)').matches
  /* swipe down to close: handle (pointer) and top of the content (touch) */
  const sd = useRef<null | { y: number; x: number; t: number; id: number; active: boolean }>(null)
  const grabDown = (e: React.PointerEvent) => {
    if (!isBottomSheet() || (e.target as HTMLElement).closest('.close')) return
    sd.current = { y: e.clientY, x: e.clientX, t: performance.now(), id: e.pointerId, active: false }
  }
  const grabMove = (e: React.PointerEvent) => {
    const s = sd.current; if (!s || e.pointerId !== s.id) return
    const dy = e.clientY - s.y
    if (!s.active) {
      if (dy > 8 && Math.abs(dy) > Math.abs(e.clientX - s.x)) { s.active = true; sheetEl.current!.classList.add('dragging'); try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* noop */ } }
      else if (dy < -8) { sd.current = null; return } else return
    }
    sheetEl.current!.style.transform = `translateY(${Math.max(0, dy)}px)`
  }
  const grabUp = (e: React.PointerEvent) => {
    const s = sd.current; if (!s || e.pointerId !== s.id) return
    const dy = e.clientY - s.y, v = dy / Math.max(1, performance.now() - s.t), was = s.active; sd.current = null
    if (!was) return
    sheetEl.current!.classList.remove('dragging')
    if (dy > 110 || v > 0.6) closeSheet(); else sheetEl.current!.style.transform = ''
  }
  useEffect(() => {
    const b = sheetBody.current; if (!b) return
    let td: null | { y: number; x: number; t: number; top: number; active: boolean } = null
    const ts = (e: TouchEvent) => { if (!isBottomSheet() || e.touches.length !== 1 || (e.target as HTMLElement).closest('.gallery')) return; td = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: performance.now(), top: b.scrollTop, active: false } }
    const tm = (e: TouchEvent) => {
      if (!td) return
      const t = e.touches[0], dy = t.clientY - td.y
      if (!td.active) {
        if (td.top <= 0 && b.scrollTop <= 0 && dy > 8 && Math.abs(dy) > Math.abs(t.clientX - td.x)) { td.active = true; sheetEl.current!.classList.add('dragging') }
        else if (Math.abs(dy) > 8 || Math.abs(t.clientX - td.x) > 8) { td = null; return } else return
      }
      e.preventDefault(); sheetEl.current!.style.transform = `translateY(${Math.max(0, dy)}px)`
    }
    const te = (e: TouchEvent) => {
      if (!td) return; const was = td.active
      const dy = (e.changedTouches[0]?.clientY ?? td.y) - td.y, v = dy / Math.max(1, performance.now() - td.t); td = null
      if (!was) return
      sheetEl.current!.classList.remove('dragging')
      if (dy > 110 || v > 0.6) closeSheet(); else sheetEl.current!.style.transform = ''
    }
    b.addEventListener('touchstart', ts, { passive: true }); b.addEventListener('touchmove', tm, { passive: false })
    b.addEventListener('touchend', te); b.addEventListener('touchcancel', te)
    return () => { b.removeEventListener('touchstart', ts); b.removeEventListener('touchmove', tm); b.removeEventListener('touchend', te); b.removeEventListener('touchcancel', te) }
  }, [sheet])
  const galStep = (dir: number) => { const g = gallery.current; const f = g?.querySelector('figure') as HTMLElement | null; if (g && f) g.scrollBy({ left: dir * (f.offsetWidth + 10), behavior: reduced ? 'auto' : 'smooth' }) }

  /* ---------- render ---------- */
  const it = sheet !== null ? ITEMS[sheet] : null
  const isFinal = index === LAST
  const inScene = view === 'wardrobe'
  const loadUpTo = Math.max(2, index + 2)   // focused piece and its neighbours

  return (
    <div className={`app ${is3D ? 'is3d' : 'is2d'} view-${view} ${view === 'wardrobe' ? 'vault' : ''}`}>
      {is3D && glMount && <Suspense fallback={null}><Experience paused={inspect !== null || view === 'grid' || view === 'gate' || (view === 'tailor' && tailor === 'in')} onFail={glFail} /></Suspense>}
      {!is3D && <div className="room2d" aria-hidden="true" />}

      {/* SCREEN 3: THE SECRET WARDROBE (accessible DOM over the 3D room) */}
      <div className={`scene ${inScene ? '' : 'is-off'} ${arrive ? 'arrive' : ''}`} inert={!inScene || sheetShown}>
        <main className="track" ref={track} tabIndex={0} role="region" aria-roledescription="carousel"
          aria-label="The wardrobe. Use the left and right arrow keys to move between pieces.">
          {ITEMS.slice(0, N).map((p, i) => {
            const on = i === index
            return (
              <section key={i} className="slide" data-i={i} role="group" aria-roledescription="slide" aria-label={`Item ${i + 1} of ${N}: ${p.name}`} aria-hidden={!on}>
                <div className="stage">
                  <Pic className="garment" src={p.images[0].src} alt={p.images[0].alt} sizes={GARMENT_SIZES}
                    load={warm || i <= loadUpTo || Math.abs(i - index) <= 2} eager={i === index || (index < 0 && i === 0)} />
                </div>
                <div className="copy">
                  <p className="kicker" aria-hidden="true">{pad(i + 1)} <span>/ {pad(N)}</span></p>
                  <h2 className="name line" style={{ '--i': 0 } as React.CSSProperties}>{p.name}</h2>
                  <p className="fabric line" style={{ '--i': 1 } as React.CSSProperties}>{p.fabric}</p>
                  {p.price != null && <p className="price line" style={{ '--i': 2 } as React.CSSProperties}>From {inr.format(p.price)}{SAMPLE_PRICES && <small>sample price</small>}</p>}
                  <div className="actions line" style={{ '--i': 3 } as React.CSSProperties}>
                    <a className="btn primary" href={enquire(p)} target="_blank" rel="noopener" tabIndex={on ? 0 : -1}>{WA_ICON}Enquire on WhatsApp</a>
                    <button className="link details" type="button" tabIndex={on ? 0 : -1} onClick={e => openInspect(i, e.currentTarget)}>View details</button>
                  </div>
                </div>
              </section>
            )
          })}
          <section className="slide final" data-i={LAST} role="group" aria-roledescription="slide" aria-label="You explored the Elite Wardrobe" aria-hidden={!isFinal}>
            <div className="stage" aria-hidden="true"><Mark className="final-logo" glow="neon" sizes="min(70vw, 420px)" /></div>
            <div className="copy">
              <h2 className="name line" id="final-title" style={{ '--i': 0 } as React.CSSProperties}>You explored our handpicked niche {withElite('Elite')} wearables.</h2>
              <button type="button" className="explore line" id="explore-collection" style={{ '--i': 1 } as React.CSSProperties} tabIndex={isFinal ? 0 : -1} onClick={() => toGrid('all')}>
                <span className="explore-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><rect x="6" y="6" width="15" height="15" rx="2.5" /><rect x="27" y="6" width="15" height="15" rx="2.5" /><rect x="6" y="27" width="15" height="15" rx="2.5" /><rect x="27" y="27" width="15" height="15" rx="2.5" /></svg></span>
                <span className="explore-text"><small>Next</small>Explore The Godfather Attire Collection</span>
                <svg className="explore-go" viewBox="0 0 20 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M1 6h17M13 1l5 5-5 5" /></svg>
              </button>
              <p className="addr line" style={{ '--i': 2 } as React.CSSProperties}>Visit us or book a fitting · <a href={CONTACT.mapsUrl} target="_blank" rel="noopener">{CONTACT.address}</a></p>
              <div className="actions line" style={{ '--i': 3 } as React.CSSProperties}>
                <a className="btn primary" href={wa('Hello, I would like to visit or book a fitting.')} target="_blank" rel="noopener" tabIndex={isFinal ? 0 : -1}>{WA_ICON}Enquire on WhatsApp</a>
                <a className="btn ghost" href={`tel:${CONTACT.phone}`} tabIndex={isFinal ? 0 : -1}>{CALL_ICON}Call {CONTACT.phoneLabel}</a>
              </div>
            </div>
          </section>
        </main>

        <button className="nav-arrow prev" id="prev" aria-label="Previous piece" disabled={index <= 0} onClick={() => goTo(indexRef.current - 1)}><Chev d="l" /></button>
        <button className="nav-arrow next" id="next" aria-label="Next piece" disabled={index >= LAST} onClick={() => goTo(indexRef.current + 1)}><Chev d="r" /></button>
        <footer className="bottombar" aria-hidden="true">
          <div className="counter" style={{ opacity: isFinal ? 0 : 1 }}>{isFinal ? '' : <>{pad(Math.max(1, index + 1))} <span>/ {pad(N)}</span></>}</div>
          <div className="progress"><i style={{ transform: `scaleX(${isFinal ? 1 : Math.max(1, index + 1) / N})` }} /></div>
          <div className={`hint ${index === 0 ? '' : 'off'}`}>Slide <svg viewBox="0 0 22 10" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M1 5h19M16 1l4 4-4 4" /></svg></div>
        </footer>
      </div>

      {inspect !== null && <Suspense fallback={null}>
        <Inspect item={ITEMS[inspect]} reduced={reduced} enquireHref={enquire(ITEMS[inspect])}
          price={ITEMS[inspect].price != null ? `From ${inr.format(ITEMS[inspect].price!)}` : null}
          onClose={() => closeInspect()}
          onDetails={() => { const i = inspect, op = inspectFrom.current; closeInspect(() => { if (op) openSheet(i, op) }) }} />
      </Suspense>}
      {outOfStock && (
        <div className="oos" id="out-of-stock" role="alertdialog" aria-modal="true" aria-labelledby="oos-title">
          <h2 id="oos-title">Out of stock</h2>
          <p>The Elite Wardrobe has nothing on the rail right now.</p>
          <button type="button" className="btn gold" id="oos-close" autoFocus onClick={() => setOutOfStock(false)}>Back</button>
        </div>
      )}
      {view === 'grid' && <Grid key={gridCat} initialCat={gridCat} onOpen={openSheet} onEnter={gridToVault} inert={sheetShown} />}
      {(view === 'wardrobe' || view === 'grid') && (
        <header className="topbar" inert={sheetShown}>
            <button className="home" id="home" aria-label="The Godfather. Return to the gate" onClick={toGate}><Mark sizes="(min-width:960px) 80px, 64px" /></button>
            {view === 'wardrobe' && <button className="back-shop" id="back-shop" type="button" onClick={callTailor}>
              <svg viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 2 2 10l8 8" /></svg>Back to the shop</button>}
            {view === 'wardrobe' && <p className="vault-label" aria-hidden="true">Elite wardrobe · {pad(Math.min(N, Math.max(1, index + 1)))}</p>}
            <div className="top-right">
              <button className="sound" id="sound" aria-pressed={sound} onClick={toggleSound}>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path className="wave" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>
                <span>{sound ? 'Sound on' : 'Sound off'}</span>
              </button>
              <button className="ask" id="ask" type="button" aria-label="Ask the tailor" onClick={callTailor}>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 15.5c2.5 1.3 15.5 1.3 18 0" /><path d="M6.2 15.2 7.4 8.6c.3-1.6 2-1.9 3-1.2l1.6 1 1.6-1c1-.7 2.7-.4 3 1.2l1.2 6.6" /><path d="M7 12.6c3 .8 7 .8 10 0" /></svg>
                <span>Ask the tailor</span>
              </button>
              <a className="ask visit" id="visit" href={CONTACT.mapsUrl} target="_blank" rel="noopener" aria-label="Visit the store on Google Maps">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>
                <span>Visit the store</span>
              </a>
              <a className="btn ghost book" id="book" href={BOOK_HREF} target="_blank" rel="noopener">Book a fitting</a>
            </div>
          </header>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true" ref={live} id="live" />

      {/* SCREEN 4: PIECE DETAIL */}
      {it && <div className={`backdrop ${sheetShown ? 'open' : ''}`} onClick={() => { if (performance.now() - openedAt.current > 300) closeSheet() }} />}
      {it && (
        <aside ref={sheetEl} className={`sheet ${sheetShown ? 'open' : ''}`} id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <div className="grab" id="grab" onPointerDown={grabDown} onPointerMove={grabMove} onPointerUp={grabUp} onPointerCancel={grabUp}>
            <span className="handle" aria-hidden="true" />
            <button className="close" id="close" aria-label="Close details" onClick={() => closeSheet()}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
            </button>
          </div>
          <div className="sheet-body" ref={sheetBody}>
            <div className="gallery" id="gallery" ref={gallery} tabIndex={0} aria-label="Photos"
              onScroll={e => { const g = e.currentTarget, f = g.querySelector('figure') as HTMLElement | null; if (f) setGIdx(Math.round(g.scrollLeft / (f.offsetWidth + 10))) }}
              onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); galStep(1) } if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); galStep(-1) } }}>
              {it.images.map((im, k) => (
                <figure key={im.src}>
                  <img src={im.src} alt={im.alt} width={768} height={1024} decoding="async" loading={k > 1 ? 'lazy' : undefined} />
                  {im.source === 'store photo' && <figcaption>From the store window</figcaption>}
                </figure>
              ))}
            </div>
            <div className="gal-nav">
              <div className="dots" aria-hidden="true">{it.images.map((_, k) => <i key={k} className={k === gIdx ? 'on' : ''} />)}</div>
              <div className="gal-btns">
                <button aria-label="Previous photo" onClick={() => galStep(-1)}><Chev d="l" /></button>
                <button aria-label="Next photo" onClick={() => galStep(1)}><Chev d="r" /></button>
              </div>
            </div>
            <h2 id="sheet-title">{it.name}</h2>
            <p className="tag">{it.tagline}</p>
            <dl className="specs" id="specs">
              <dt>Fabric</dt><dd>{it.fabric}</dd>
              <dt>Fit</dt><dd>{it.details.fit}</dd>
              <dt>Colours</dt><dd><span className="swatches">{it.colours.map(c => <span className="swatch" key={c.name}><b style={{ background: c.hex }} />{c.name}</span>)}</span></dd>
              <dt>Made to measure</dt><dd>{it.details.madeToMeasure}</dd>
              <dt>Delivery</dt><dd>{it.details.delivery}</dd>
              {it.price != null && SAMPLE_PRICES && <><dt>Price</dt><dd>Sample price, subject to change</dd></>}
            </dl>
            <ShopBuy item={it} />
            <a className="btn primary" id="sheet-wa" href={enquire(it)} target="_blank" rel="noopener">{WA_ICON}Enquire on WhatsApp</a>
          </div>
        </aside>
      )}

      {/* SCREEN 1 + 2: THE GATE (3D logo behind; this layer holds the accessible tap target) */}
      {tailor !== 'off' && <Tailor phase={tailor} quick={tailorQuick} reduced={reduced} onChoose={choose} onNav={hostNav} />}

      {(view === 'gate' || view === 'transition') && (
        <div key={gateKey} className={`gate intro ${view === 'transition' ? 'leaving' : ''}`} id="gate" inert={view !== 'gate'}
          style={gateKey === 0 ? { '--t0': `${-Math.round(performance.now())}ms` } as React.CSSProperties : undefined}>
          <div className="gate-inner">
            <span className="crest-halo" aria-hidden="true" />
            <button className="crest-btn" id="crest" ref={crest} aria-label="The Godfather Menswear. Touch the crest to enter" onClick={enter}>
              <span className="half l"><Mark glow="neon" sizes="min(78vw, 560px)" /></span>
              <span className="half r"><Mark glow="neon" sizes="min(78vw, 560px)" /></span>
            </button>
            <p className="gate-line" id="gate-line">Touch the crest to enter.</p>
          </div>
        </div>
      )}
      {view === 'transition' && <button className="skip" id="skip" onClick={finishEnter}>Skip</button>}
      {view === 'walk' && <button className="skip walk-skip" id="walk-skip" onClick={skipWalk}>Skip</button>}
      <div className={`blackout ${fadeBlack ? 'on' : ''}`} aria-hidden="true" />
      <div className="ring" ref={ring} aria-hidden="true" />
      <CartButton hidden={view === 'gate' || view === 'transition' || view === 'tailor' || view === 'walk'} />
      <CartDrawer />
      {DEBUG_FPS && <FpsOverlay mode={mode} />}
      {!is3D && <div className="grain" aria-hidden="true" />}
    </div>
  )
}
