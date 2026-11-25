/* The Elite Wardrobe: twelve numbered slots in the order the vault shows them. Drag a piece onto another slot, or use the arrows. */
import { useState } from 'react'
import { publicUrl, type Row } from '../supa'

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export default function EliteSlots({ rows, max, onEdit, onAdd, onReorder, onMove, onToggle, canMove }: {
  rows: Row[]; max: number; canMove: boolean
  onEdit: (r: Row) => void; onAdd: () => void; onReorder: (next: Row[]) => void; onMove: (r: Row) => void; onToggle: (r: Row) => void
}) {
  const [from, setFrom] = useState<number | null>(null), [over, setOver] = useState<number | null>(null)
  const slots: (Row | null)[] = Array.from({ length: max }, (_, i) => rows[i] ?? null)
  const reorder = (a: number, b: number) => {
    const to = Math.min(b, rows.length - 1)
    if (a === to || a < 0 || a >= rows.length) return
    const next = rows.slice(); const [m] = next.splice(a, 1); next.splice(to, 0, m); onReorder(next)
  }
  let firstEmpty = true
  return (
    <ol className="slots" aria-label="Elite Wardrobe slots">
      {slots.map((r, i) => r ? (
        <li key={r.id} className={`slot ${from === i ? 'drag' : ''} ${over === i && from !== null && from !== i ? 'over' : ''} ${r.published ? '' : 'draft'}`} data-slot={i + 1} data-slug={r.slug}
          draggable onDragStart={e => { setFrom(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(i) }} onDragLeave={() => setOver(o => o === i ? null : o)}
          onDrop={e => { e.preventDefault(); const a = from ?? Number(e.dataTransfer.getData('text/plain')); setFrom(null); setOver(null); setTimeout(() => reorder(a, i), 0) }} onDragEnd={() => { setFrom(null); setOver(null) }}>
          <span className="slot-no" aria-hidden="true">{i + 1}</span>
          <span className="grip" aria-hidden="true" title="Drag to reorder">⠿</span>
          <span className="thumb big" style={r.blur ? { backgroundImage: `url(${r.blur})` } : undefined}>{r.front_path && <img src={publicUrl(r.front_path, r.updated_at)} alt="" loading="lazy" draggable={false} />}</span>
          <b className="slot-name">{r.name}</b>
          <span className="slot-sub">{r.price_from != null ? inr.format(r.price_from) : 'Price on request'} · {r.published ? 'Live' : 'Hidden'}</span>
          <span className="slot-btns">
            <button type="button" className="ghost small" aria-label={`Move ${r.name} earlier`} disabled={i === 0} data-act="left" onClick={() => reorder(i, i - 1)}>←</button>
            <button type="button" className="ghost small" aria-label={`Move ${r.name} later`} disabled={i === rows.length - 1} data-act="right" onClick={() => reorder(i, i + 1)}>→</button>
            <button type="button" className="ghost small" onClick={() => onEdit(r)}>Edit</button>
          </span>
          <span className="slot-btns">
            <label className="pub"><input type="checkbox" checked={r.published} onChange={() => onToggle(r)} /> {r.published ? 'Live' : 'Hidden'}</label>
            <button type="button" className="ghost small" disabled={!canMove} title={canMove ? 'Move this piece to the Attire Collection' : 'The Attire Collection is full'} onClick={() => onMove(r)}>To Attire</button>
          </span>
        </li>
      ) : (
        <li key={`empty-${i}`} className={`slot empty ${over === i && from !== null ? 'over' : ''}`} data-slot={i + 1}
          onDragOver={e => { e.preventDefault(); setOver(i) }} onDragLeave={() => setOver(o => o === i ? null : o)}
          onDrop={e => { e.preventDefault(); const a = from ?? Number(e.dataTransfer.getData('text/plain')); setFrom(null); setOver(null); setTimeout(() => reorder(a, i), 0) }}>
          <span className="slot-no" aria-hidden="true">{i + 1}</span>
          {firstEmpty && (firstEmpty = false, true)
            ? <button type="button" id="elite-add" className="slot-add" onClick={onAdd}>+ Add a piece to slot {i + 1}</button>
            : <span className="slot-free">Free slot</span>}
        </li>
      ))}
    </ol>
  )
}
