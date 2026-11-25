import { withElite } from './Elite'
import Pic from './Pic'
import { useEffect, useState } from 'react'
import { CATEGORIES, FOLLOW_URL, ITEMS, SAMPLE_PRICES, inGrid } from './data'

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/* The attire tour: every piece on one page. A card opens the same detail sheet as the wardrobe. */
export default function Grid({ onOpen, onEnter, inert, initialCat = 'all' }: {
  initialCat?: string
  onOpen: (i: number, el: HTMLElement) => void
  onEnter: () => void
  inert: boolean
}) {
  const [cat, setCat] = useState<string>(initialCat)
  /* the heading takes focus once the grid is on screen (the app's own focus call can run before React has rendered it) */
  useEffect(() => { document.getElementById('grid-title')?.focus({ preventScroll: true }) }, [])
  const all = ITEMS.map((it, i) => ({ it, i })).filter(x => inGrid(x.it))
  const list = all.filter(x => cat === 'all' || x.it.category === cat)
  return (
    <main className="grid-page" id="grid" inert={inert} aria-labelledby="grid-title">
      <header className="grid-head">
        <h1 id="grid-title" tabIndex={-1}>The Godfather Attire Collection</h1>
        <p>Every piece in the house. Tap one for the details.</p>
        <div className="chips" role="group" aria-label="Filter by category">
          {CATEGORIES.map(c => (
            <button key={c.id} type="button" className="chip" id={`chip-${c.id}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>
          ))}
        </div>
      </header>
      {ITEMS.length === 0 && (
        <p className="grid-empty" id="grid-empty" role="status">Nothing is on the rack right now. <a id="follow-link" href={FOLLOW_URL} target="_blank" rel="noopener noreferrer">Follow</a> us to hear first.</p>
      )}
      {ITEMS.length > 0 && all.length === 0 && (
        <p className="grid-empty" id="grid-soon" role="status">New arrivals are coming soon. Meanwhile, step into the {withElite('Elite')} Wardrobe.</p>
      )}
      <ul className="cards" aria-live="polite">
        {list.map(({ it, i }) => (
          <li key={i}>
            <button type="button" className="card" data-i={i} onClick={e => onOpen(i, e.currentTarget)}
              aria-label={`${it.name}${it.price != null ? `, from ${inr.format(it.price)}` : ''}. View details`}>
              <Pic className="card-img" src={it.images[0].src} alt="" lazy sizes="(min-width:1100px) 290px, (min-width:760px) 31vw, 47vw" />
              <span className="card-name">{it.name}</span>
              {it.price != null && <span className="card-price">From {inr.format(it.price)}{SAMPLE_PRICES && <small> sample</small>}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="grid-foot">
        <p>Prefer to see them one at a time, in the light?</p>
        <button type="button" className="btn gold" id="enter-vault" onClick={onEnter}>Enter the {withElite('Elite')} Wardrobe</button>
      </div>
    </main>
  )
}
