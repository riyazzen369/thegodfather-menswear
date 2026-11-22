import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './styles.css'
import App from './App'
import { catalogueChanged } from './data'
import { apply, fetchRows, liveEnabled, subscribe, type Row } from './supa'

/* Live catalogue: start from the last copy this browser saw (or the bundled pieces), then refresh from Supabase
   and follow its realtime feed. Pieces added/removed remount the app; edits to existing pieces just re-render. */
const CACHE = 'gf-catalogue-v1'
if (liveEnabled) { try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (Array.isArray(c) && c.length) { apply(c); catalogueChanged() } } catch { /* ignore */ } }

function Root() {
  const [mount, setMount] = useState(0), [rev, setRev] = useState(0)
  useEffect(() => {
    if (!liveEnabled) return
    let off = () => {}, dead = false
    const take = (rows: Row[] | null) => {
      if (dead) return
      if (rows) try { localStorage.setItem(CACHE, JSON.stringify(rows)) } catch { /* full */ }
      const r = apply(rows); (window as any).__catalogue = { source: rows ? 'live' : 'bundled', rev: Date.now() }
      if (r === 'same') return
      catalogueChanged()
      if (r === 'structure') setMount(m => m + 1); else setRev(v => v + 1)
    }
    /* unreachable: keep whatever we have (cache or bundled) */
    fetchRows().then(rows => { if (rows) take(rows); else (window as any).__catalogue = { source: 'fallback' } })
    subscribe(rows => { if (rows) take(rows) }).then(f => { off = f })
    return () => { dead = true; off() }
  }, [])
  return <App key={mount} rev={rev} />
}
createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>)
