import { useState } from 'react'
import { CATEGORIES, ITEMS, SAMPLE_PRICES } from './data'

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/* The attire tour: every piece on one page. A card opens the same detail sheet as the wardrobe. */
export default function Grid({ onOpen, onEnter, inert, initialCat = 'all' }: {
  initialCat?: string
  onOpen: (i: number, el: HTMLElement) => void
  onEnter: () => void
  inert: boolean
}) {
  const [cat, setCat] = useState<string>(initialCat)
  const list = ITEMS.map((it, i) => ({ it, i })).filter(x => cat === 'all' || x.it.category === cat)
  return (
    <main className="grid-page" id="grid" inert={inert} aria-labelledby="grid-title">
      <header className="grid-head">
        <h1 id="grid-title" tabIndex={-1}>The attire tour</h1>
        <p>Every piece in the house. Tap one for the details.</p>
        <div className="chips" role="group" aria-label="Filter by category">
          {CATEGORIES.map(c => (
            <button key={c.id} type="button" className="chip" id={`chip-${c.id}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>
          ))}
        </div>
      </header>
      <ul className="cards" aria-live="polite">
        {list.map(({ it, i }) => (
          <li key={i}>
            <button type="button" className="card" data-i={i} onClick={e => onOpen(i, e.currentTarget)}
              aria-label={`${it.name}${it.price != null ? `, from ${inr.format(it.price)}` : ''}. View details`}>
              <span className="card-img"><img src={it.images[0].src} alt="" width={768} height={1024} loading="lazy" decoding="async" /></span>
              <span className="card-name">{it.name}</span>
              {it.price != null && <span className="card-price">From {inr.format(it.price)}{SAMPLE_PRICES && <small> sample</small>}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="grid-foot">
        <p>Prefer to see them one at a time, in the light?</p>
        <button type="button" className="btn gold" id="enter-vault" onClick={onEnter}>Enter the premium wardrobe</button>
      </div>
    </main>
  )
}
