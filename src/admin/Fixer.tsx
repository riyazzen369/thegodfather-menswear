/* Fix cut-out: tap a detected object to include or leave it out, and paint with an erase or restore brush for the rest. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { currentAlpha, type EditState, type Stroke } from './attire'

type Tool = 'tap' | 'erase' | 'restore'
export default function Fixer({ st, onDone, onCancel }: { st: EditState; onDone: (next: EditState) => void; onCancel: () => void }) {
  const [tool, setTool] = useState<Tool>('tap'), [size, setSize] = useState(0.035), [tick, setTick] = useState(0), [hint, setHint] = useState('')
  const include = useRef<number[]>(st.include.slice()), strokes = useRef<Stroke[]>(st.strokes.slice()), history = useRef<{ i: number[]; s: Stroke[] }[]>([])
  const cv = useRef<HTMLCanvasElement>(null), cursor = useRef<HTMLDivElement>(null), raf = useRef(0)
  const scale = Math.min(1, 720 / Math.max(st.w, st.h)), dw = Math.max(2, Math.round(st.w * scale)), dh = Math.max(2, Math.round(st.h * scale))
  /* the original pixels at display size, made once */
  const base = useMemo(() => {
    const full = document.createElement('canvas'); full.width = st.w; full.height = st.h
    const fg = full.getContext('2d')!, im = fg.createImageData(st.w, st.h); im.data.set(st.rgb); for (let i = 3; i < im.data.length; i += 4) im.data[i] = 255; fg.putImageData(im, 0, 0)
    const c = document.createElement('canvas'); c.width = dw; c.height = dh; c.getContext('2d')!.drawImage(full, 0, 0, dw, dh)
    return c.getContext('2d')!.getImageData(0, 0, dw, dh).data
  }, [st, dw, dh])
  const draw = () => {
    const c = cv.current; if (!c) return
    const local: EditState = { ...st, include: include.current, strokes: strokes.current }
    const { alpha } = currentAlpha(local, scale), g = c.getContext('2d')!, im = g.createImageData(dw, dh), keep = new Set(include.current)
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(st.h - 1, Math.floor(y / scale)) * st.w
      for (let x = 0; x < dw; x++) {
        const i = y * dw + x, o = i * 4, a = alpha[i]
        if (a > 0) { im.data[o] = base[o]; im.data[o + 1] = base[o + 1]; im.data[o + 2] = base[o + 2]; im.data[o + 3] = a }
        else { const lab = st.labels[sy + Math.min(st.w - 1, Math.floor(x / scale))]
          if (lab > 0 && !keep.has(lab)) { im.data[o] = 200 + base[o] * 0.15; im.data[o + 1] = base[o + 1] * 0.3; im.data[o + 2] = base[o + 2] * 0.3; im.data[o + 3] = 120 } }   // left-out objects: faint red ghost
      }
    }
    g.putImageData(im, 0, 0)
  }
  useEffect(() => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(draw) })  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onCancel])
  const redraw = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(draw); setTick(t => t + 1) }
  const snap = () => { history.current.push({ i: include.current.slice(), s: strokes.current.slice() }); if (history.current.length > 30) history.current.shift() }
  const pos = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } }
  const down = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const addStroke = (p: { x: number; y: number }, last?: Stroke) => {
    const r = size; if (last && Math.hypot((p.x - last.x) * st.w, (p.y - last.y) * st.h) < r * Math.max(st.w, st.h) * 0.35) return
    strokes.current = [...strokes.current, { x: p.x, y: p.y, r, add: tool === 'restore' }]
  }
  const pick = (p: { x: number; y: number }) => {
    /* the nearest detected piece within a few pixels of the tap (thin parts are hard to hit) */
    const cx = Math.round(p.x * (st.w - 1)), cy = Math.round(p.y * (st.h - 1)), R = Math.round(Math.max(st.w, st.h) * 0.012)
    let best = 0, bd = 1e9
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= st.w || y >= st.h) continue; const l = st.labels[y * st.w + x]; if (l && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = l } }
    if (!best) { setHint('Nothing here. Tap a highlighted object, or use the brush to paint.'); return }
    snap(); const on = include.current.includes(best)
    include.current = on ? include.current.filter(x => x !== best) : [...include.current, best]
    setHint(on ? 'Left out. Tap again to bring it back.' : 'Included.'); redraw()
  }
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId); const p = pos(e); down.current = { ...p, moved: false, id: e.pointerId }
    if (tool !== 'tap') { snap(); addStroke(p); redraw() }
  }
  const onMove = (e: React.PointerEvent) => {
    const p = pos(e), r = cv.current!.getBoundingClientRect()
    if (cursor.current) { cursor.current.style.display = tool === 'tap' ? 'none' : 'block'; const d = size * Math.max(dw, dh) * 2; cursor.current.style.width = cursor.current.style.height = `${d}px`; cursor.current.style.left = `${e.clientX - r.left}px`; cursor.current.style.top = `${e.clientY - r.top}px` }
    if (!down.current) return
    if (Math.hypot(p.x - down.current.x, p.y - down.current.y) > 0.004) down.current.moved = true
    if (tool !== 'tap') { addStroke(p, strokes.current[strokes.current.length - 1]); redraw() }
  }
  const onUp = (e: React.PointerEvent) => { const d = down.current; down.current = null; if (d && tool === 'tap' && !d.moved) pick(pos(e)) }
  const undo = () => { const h = history.current.pop(); if (!h) return; include.current = h.i; strokes.current = h.s; setHint('Undone.'); redraw() }
  const reset = () => { snap(); include.current = st.include.slice(); strokes.current = []; setHint('Back to the automatic result.'); redraw() }
  const objects = st.comps.filter(c => c.area > st.w * st.h * 0.004)
  return (
    <div className="fix-back" role="dialog" aria-modal="true" aria-labelledby="fix-title">
      <div className="fix">
        <header><h2 id="fix-title">Fix the cut-out</h2><button type="button" className="ghost small" onClick={onCancel} aria-label="Close without changes">×</button></header>
        <p className="note">The garment is picked automatically. Red ghosts are objects that were left out: <b>tap</b> one to include it, or tap the garment's extra pieces to remove them. Use <b>Erase</b> and <b>Restore</b> to paint the edges.</p>
        <div className="fix-tools" role="radiogroup" aria-label="Tool">
          {([['tap', 'Tap objects'], ['erase', 'Erase'], ['restore', 'Restore']] as const).map(([t, l]) => (
            <button key={t} type="button" role="radio" aria-checked={tool === t} id={`fix-${t}`} className={`ghost ${tool === t ? 'on' : ''}`} disabled={t === 'restore' && !st.canRestore} title={t === 'restore' && !st.canRestore ? 'This upload was already a transparent cut-out, so there is nothing to bring back' : undefined} onClick={() => setTool(t)}>{l}</button>))}
          <label className="fix-size">Brush <input type="range" min="0.01" max="0.09" step="0.005" value={size} onChange={e => setSize(Number(e.target.value))} aria-label="Brush size" /></label>
          <button type="button" className="ghost" id="fix-undo" onClick={undo} disabled={!history.current.length && !tick}>Undo</button>
          <button type="button" className="ghost" id="fix-reset" onClick={reset}>Automatic</button>
        </div>
        <div className="fix-stage">
          <div className="fix-wrap" style={{ width: dw, height: dh }}>
            <canvas ref={cv} id="fix-canvas" width={dw} height={dh} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { down.current = null }} onPointerLeave={() => { if (cursor.current) cursor.current.style.display = 'none' }} />
            <div ref={cursor} className="fix-cursor" aria-hidden="true" />
          </div>
        </div>
        <p className="note" role="status" id="fix-hint">{hint || `${objects.length} object${objects.length === 1 ? '' : 's'} found, ${include.current.length} included.`}</p>
        <div className="adm-actions"><button type="button" id="fix-done" onClick={() => onDone({ ...st, include: include.current, strokes: strokes.current })}>Use this cut-out</button><button type="button" className="ghost" onClick={onCancel}>Cancel</button></div>
      </div>
    </div>
  )
}
