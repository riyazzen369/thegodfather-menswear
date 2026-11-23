import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './styles.css'
import App from './App'
import { catalogueChanged } from './data'
import { rig } from './rig'
import { apply, fetchCatalogue, liveEnabled, peek, subscribe, type Fetched, type Row } from './supa'

/* Live catalogue: start from the last copy this browser saw (or the bundled pieces), then refresh from Supabase
   and follow its realtime feed. Edits to existing pieces just re-render. Pieces added/removed remount the app, but only
   while the visitor is at the gate or the shopkeeper (never yanks them out of the vault or the grid). */
const CACHE = 'gf-catalogue-v1'
if (liveEnabled) { try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (Array.isArray(c) && c.length) { apply(c); catalogueChanged() } } catch { /* ignore */ } }
const setSource = (source: string) => { (window as any).__catalogue = { source, rev: Date.now() } }

function Root() {
  const [mount, setMount] = useState(0), [rev, setRev] = useState(0)
  useEffect(() => {
    if (!liveEnabled) return
    let dead = false, waitT = 0, retryT = 0, debounceT = 0, tries = 0, offRt = () => {}
    let pending: { rows: Row[] } | null = null
    /* remount=false: update the data and re-render in place (the visitor keeps their place) */
    const commit = (rows: Row[], remount: boolean) => {
      const r = apply(rows); if (r === 'same') return
      catalogueChanged()
      if (r === 'structure' && remount) setMount(m => m + 1); else setRev(v => v + 1)
    }
    const safe = () => rig.view === 'gate' || rig.view === 'tailor'
    const tryPending = () => {
      if (!pending || dead || !safe()) return
      const p = pending; pending = null; clearInterval(waitT); waitT = 0; commit(p.rows, true)
    }
    const take = (res: Fetched) => {
      if (dead) return
      /* a successful read is the truth, even when empty: [] means nothing is published, so the screen shows the empty state
         ("Out of stock" / Follow), never the bundled pieces. The saved copy is cleared then, so stale data does not come back. */
      const rows = res.rows
      try { if (rows.length) localStorage.setItem(CACHE, JSON.stringify(rows)); else localStorage.removeItem(CACHE) } catch { /* full */ }
      setSource(rows.length ? 'live' : 'empty')
      const kind = peek(rows)
      if (kind === 'same') { pending = null; return }
      if (kind === 'structure' && !safe()) {
        /* the grid is plain DOM: update it in place. In the walk or the vault, wait until the visitor is back at the gate or the shopkeeper. */
        if (rig.view === 'grid') { pending = null; commit(rows, false); return }
        pending = { rows }; if (!waitT) waitT = window.setInterval(tryPending, 500); return
      }
      pending = null; commit(rows, true)
    }
    const load = () => {
      fetchCatalogue(8000).then(res => {
        if (dead) return
        if (res.ok) { tries = 0; take(res); return }
        /* unreachable: keep whatever we have (cache or bundled) and try again with backoff */
        if ((window as any).__catalogue?.source !== 'live') setSource('fallback')
        if (tries < 3) { clearTimeout(retryT); retryT = window.setTimeout(load, [2000, 5000, 12000][tries++]) }
      })
    }
    const refetch = () => { clearTimeout(debounceT); debounceT = window.setTimeout(load, 250) }
    const vis = () => { if (document.visibilityState === 'visible') refetch() }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('online', refetch)
    load()
    /* realtime needs supabase-js (217 kB): start it on the first input, or after 6 s, not at start-up */
    const ev = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel'] as const
    let rtStarted = false
    const startRt = () => { if (rtStarted || dead) return; rtStarted = true; offRt = subscribe(refetch) }
    ev.forEach(e => window.addEventListener(e, startRt, { once: true, passive: true }))
    const rtT = window.setTimeout(startRt, 6000)
    return () => {
      dead = true; clearInterval(waitT); clearTimeout(retryT); clearTimeout(debounceT); clearTimeout(rtT)
      document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', refetch)
      ev.forEach(e => window.removeEventListener(e, startRt)); offRt()
    }
  }, [])
  return <App key={mount} rev={rev} />
}
createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>)
