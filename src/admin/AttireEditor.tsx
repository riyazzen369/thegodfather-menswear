/* Attire product editor: up to four photos. Each is compressed, cut out of its background (even a busy one), framed and placed on the
   house velvet plate. Everything is reviewable: nudge the framing, fix the cut-out, reorder, then save. */
import { useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ATTIRE_CATEGORIES, gridCategory } from '../data'
import { publicUrl, type Row } from '../supa'
import { CAP, KIND_NAME, MAX_PRICE, MAX_SORT, slugify, type Draft } from './shared'
import { cutFromUrl, cutOutRaw, NUDGE0, place, rawBlob, type Cut, type Nudge, type Placed } from './normalize'
import { buildState, kb, smallCopy, toCut, warnings, type EditState } from './attire'
import Fixer from './Fixer'

const SLOTS = 4, MAX_BYTES = 150_000, MAX_UPLOAD = 30 * 1024 * 1024
type Slot = {
  status: 'empty' | 'busy' | 'ready'; step: string; edit: EditState | null; cut: Cut | null; nudge: Nudge; placed: Placed | null; warn: string[]
  bytesIn: number | null; fresh: boolean; savedPhoto: string | null; savedSrc: string | null
}
const empty = (): Slot => ({ status: 'empty', step: '', edit: null, cut: null, nudge: { ...NUDGE0 }, placed: null, warn: [], bytesIn: null, fresh: false, savedPhoto: null, savedSrc: null })
const STEPS = { s: 0.02, x: 0.01, y: 0.01 }
const remote = (p: string | null | undefined) => !!p && !p.startsWith('site:')

export default function AttireEditor({ sb, draft, onDone }: { sb: SupabaseClient; draft: Draft; onDone: () => void }) {
  const [d, setD] = useState<Draft>(draft), [err, setErr] = useState(''), [busy, setBusy] = useState('')
  const isNew = !draft.id, slugTouched = useRef(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }))
  const setDet = (k: keyof Row['details'], v: string) => setD(x => ({ ...x, details: { ...x.details, [k]: v } }))
  /* the four slots, from what is saved: slots[] in src_paths when this editor made the product, else front + extra photos */
  const initial = (): Slot[] => {
    const sv = (draft.src_paths as { slots?: ({ photo: string | null; src: string | null; nudge?: Nudge } | null)[] } | undefined)?.slots
    const out = Array.from({ length: SLOTS }, empty)
    if (sv?.length) sv.slice(0, SLOTS).forEach((x, i) => { if (x?.photo) out[i] = { ...empty(), status: 'ready', savedPhoto: x.photo, savedSrc: x.src ?? null, nudge: { ...NUDGE0, ...(x.nudge || {}) } } })
    else {
      const paths = [draft.front_path, ...(draft.extra_paths || []).map(e => e.path)].filter(Boolean) as string[]
      paths.slice(0, SLOTS).forEach((p, i) => { out[i] = { ...empty(), status: 'ready', savedPhoto: p } })
    }
    return out
  }
  const [slots, setSlots] = useState<Slot[]>(initial)
  const ref = useRef(slots); ref.current = slots
  const patch = (i: number, p: Partial<Slot>) => { const next = ref.current.map((s, k) => k === i ? { ...s, ...p } : s); ref.current = next; setSlots(next) }
  const [fix, setFix] = useState<number | null>(null)
  const removed = useRef<string[]>([])
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const nudgeT = useRef<number[]>([])

  const process = async (i: number, file: File) => {
    try {
      patch(i, { status: 'busy', step: 'Reading the photo…', bytesIn: file.size, warn: [] })
      const raw = await cutOutRaw(file, s => patch(i, { step: s }))
      patch(i, { step: 'Finding the garment…' })
      const edit = buildState(raw), cut = await toCut(edit)
      patch(i, { step: 'Placing it on the velvet and compressing…' })
      const placed = await place(cut, NUDGE0, { photo: true, maxBytes: MAX_BYTES })
      const old = ref.current[i].placed; if (old) { URL.revokeObjectURL(old.cutUrl); old.photoUrl && URL.revokeObjectURL(old.photoUrl) }
      if (ref.current[i].savedPhoto && remote(ref.current[i].savedPhoto) && !removed.current.includes(ref.current[i].savedPhoto!)) removed.current.push(ref.current[i].savedPhoto!)
      if (ref.current[i].savedSrc && remote(ref.current[i].savedSrc)) removed.current.push(ref.current[i].savedSrc!)
      patch(i, { status: 'ready', step: '', edit, cut, nudge: { ...NUDGE0 }, placed, warn: warnings(edit), fresh: true, savedPhoto: null, savedSrc: null })
    } catch (e) { patch(i, { status: ref.current[i].placed || ref.current[i].savedPhoto ? 'ready' : 'empty', step: '' }); setErr((e as Error).message || 'That photo could not be processed.') }
  }
  /* files go to slot `at` first, then the next free slots; one photo is processed at a time (the model is heavy) */
  const addFiles = (files: File[], at: number) => {
    setErr('')
    const imgs = files.filter(f => /^image\//.test(f.type))
    if (!imgs.length) return setErr('Pick image files (JPG, PNG or WebP).')
    if (imgs.some(f => f.size > MAX_UPLOAD)) return setErr('One of the photos is over 30 MB. Use a smaller photo.')
    const targets: number[] = [at]
    for (let k = 0; k < SLOTS && targets.length < imgs.length; k++) if (k !== at && ref.current[k].status === 'empty') targets.push(k)
    imgs.slice(0, targets.length).forEach((f, n) => { queue.current = queue.current.then(() => process(targets[n], f)) })
    if (imgs.length > targets.length) setErr(`Only ${targets.length} slot${targets.length === 1 ? ' was' : 's were'} free, so ${imgs.length - targets.length} photo${imgs.length - targets.length === 1 ? ' was' : 's were'} skipped.`)
  }
  const relayout = (i: number, nudge: Nudge) => {
    clearTimeout(nudgeT.current[i])
    nudgeT.current[i] = window.setTimeout(async () => {
      const s = ref.current[i]; if (!s.cut) return
      const placed = await place(s.cut, nudge, { photo: true, maxBytes: MAX_BYTES })
      if (s.placed) { URL.revokeObjectURL(s.placed.cutUrl); s.placed.photoUrl && URL.revokeObjectURL(s.placed.photoUrl) }
      patch(i, { placed })
    }, 140)
  }
  const nudge = (i: number, k: keyof Nudge, v: number) => {
    const s = ref.current[i]; if (!s.cut) return
    const n = { ...s.nudge, [k]: Math.round((k === 's' ? Math.min(1.4, Math.max(0.6, v)) : Math.min(0.2, Math.max(-0.2, v))) * 1000) / 1000 }
    patch(i, { nudge: n }); relayout(i, n)
  }
  const loadSaved = async (i: number) => {   // "Adjust framing" on a saved photo: bring back its cut-out
    const s = ref.current[i]; if (!s.savedSrc) return
    try {
      setBusy('Loading…'); const cut = await cutFromUrl(publicUrl(s.savedSrc)!)
      const placed = await place(cut, s.nudge, { photo: true, maxBytes: MAX_BYTES })
      patch(i, { cut, placed, fresh: false })
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  const remove = (i: number) => {
    const s = ref.current[i]
    for (const p of [s.savedPhoto, s.savedSrc]) if (remote(p)) removed.current.push(p!)
    if (s.placed) { URL.revokeObjectURL(s.placed.cutUrl); s.placed.photoUrl && URL.revokeObjectURL(s.placed.photoUrl) }
    patch(i, empty())
  }
  const swap = (i: number, j: number) => { if (j < 0 || j >= SLOTS) return; const a = ref.current.slice(); [a[i], a[j]] = [a[j], a[i]]; ref.current = a; setSlots(a) }
  const applyFix = async (i: number, st: EditState) => {
    setFix(null)
    try {
      patch(i, { status: 'busy', step: 'Applying your fixes…' })
      const cut = await toCut(st), placed = await place(cut, ref.current[i].nudge, { photo: true, maxBytes: MAX_BYTES })
      const old = ref.current[i].placed; if (old) { URL.revokeObjectURL(old.cutUrl); old.photoUrl && URL.revokeObjectURL(old.photoUrl) }
      patch(i, { status: 'ready', step: '', edit: st, cut, placed, warn: warnings(st), fresh: true })
    } catch (e) { patch(i, { status: 'ready', step: '' }); setErr((e as Error).message) }
  }
  useEffect(() => () => { for (const s of ref.current) if (s.placed) { URL.revokeObjectURL(s.placed.cutUrl); s.placed.photoUrl && URL.revokeObjectURL(s.placed.photoUrl) } }, [])

  const urlOf = (s: Slot) => s.placed?.photoUrl ?? (s.savedPhoto ? publicUrl(s.savedPhoto, d.updated_at) : undefined)
  const filled = slots.filter(s => s.status !== 'empty')

  const save = async () => {
    const slug = d.slug || slugify(d.name)
    if (!d.name.trim()) return setErr('Give the product a name.')
    if (!slug) return setErr('The name needs at least one letter or number.')
    if (slots.some(s => s.status === 'busy')) return setErr('Wait for the photos to finish processing.')
    if (!filled.length) return setErr('Add at least one photo.')
    setErr('')
    const uploaded: string[] = []
    try {
      { let q = sb.from('products').select('id', { count: 'exact', head: true }).eq('collection', 'attire'); if (draft.id) q = q.neq('id', draft.id)
        const { count, error: ce } = await q; if (ce) throw ce
        if ((count ?? 0) >= CAP.attire) return setErr(`The ${KIND_NAME.attire} already has ${CAP.attire} products. Delete or move one first.`) }
      if (!draft.id) {
        setBusy('Checking…')
        const { data: clash, error: ce } = await sb.from('products').select('id').eq('slug', slug).maybeSingle(); if (ce) throw ce
        if (clash) return setErr('Another product already uses that web name (slug). Change it and save again.')
      }
      const stamp = Date.now().toString(36), old = removed.current.slice()
      const upload = async (blob: Blob, name: string) => {
        setBusy(`Uploading ${name}…`)
        const path = `${slug}/${name}-${stamp}.webp`
        const { error } = await sb.storage.from('products').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
        if (error) throw error
        uploaded.push(path); return path
      }
      const final: { photo: string; src: string | null; nudge: Nudge; fresh: boolean; placed: Placed | null }[] = []
      for (let i = 0; i < SLOTS; i++) {
        const s = slots[i]; if (s.status === 'empty') continue
        let photo = s.savedPhoto, src = s.savedSrc
        if (s.placed) {                                         // new or re-framed: write the picture
          if (remote(photo)) old.push(photo!)
          photo = await upload(s.placed.photo!, `photo-${i + 1}`)
          if (s.fresh && s.cut) { if (remote(src)) old.push(src!); src = await upload(await rawBlob(s.cut), `photo-${i + 1}-src`) }
        }
        final.push({ photo: photo!, src, nudge: s.nudge, fresh: s.fresh, placed: s.placed })
      }
      const row: Draft = { ...d, slug, name: d.name.trim(), collection: 'attire', category: gridCategory(d.category), src_paths: { ...(d.src_paths || {}), slots: final.map(f => ({ photo: f.photo, src: f.src, nudge: f.nudge })) } as Row['src_paths'] }
      row.front_path = final[0].photo
      row.extra_paths = final.slice(1).map((f, k) => ({ path: f.photo, alt: `${row.name}, photo ${k + 2}` }))
      row.back_path = null
      if (final[0].placed) {                                    // the first photo is the grid card: 512 px copy + blur placeholder
        const sm = await smallCopy(final[0].placed.photo!), prev = (d.details as { front512?: string }).front512
        if (remote(prev)) old.push(prev!)
        row.details = { ...row.details, ...(sm ? { front512: await upload(sm, 'photo-1-512') } : {}) } as Row['details']; if (!sm) delete (row.details as { front512?: string }).front512
        row.blur = final[0].placed.blur
      }
      setBusy('Saving…')
      const { id, updated_at, ...fields } = row as Draft & { created_at?: string }; delete (fields as { created_at?: string }).created_at
      const { error } = id ? await sb.from('products').update(fields).eq('id', id) : await sb.from('products').insert(fields)
      if (error) throw error
      const gone = old.filter(remote); if (gone.length) await sb.storage.from('products').remove(gone)
      onDone()
    } catch (e) {
      if (uploaded.length) await sb.storage.from('products').remove(uploaded).catch(() => {})
      const m = (e as Error).message || 'Something went wrong.'
      setErr(m.includes('duplicate key') ? 'Another product already uses that web name (slug).' : /exceeds|out of range|integer/i.test(m) ? 'One of the numbers is too large. Check Price and Order.' : /row-level security|not allowed|403/i.test(m) ? 'This account is not allowed to change the catalogue.' : m)
    } finally { setBusy('') }
  }
  const del = async () => {
    if (!draft.id || !confirm(`Delete “${draft.name}”? This cannot be undone.`)) return
    setBusy('Deleting…')
    const { error } = await sb.from('products').delete().eq('id', draft.id)
    if (error) { setErr(error.message); setBusy(''); return }
    const sv = (draft.src_paths as { slots?: { photo: string | null; src: string | null }[] } | undefined)?.slots ?? []
    const files = [draft.front_path, ...draft.extra_paths.map(e => e.path), (draft.details as { front512?: string }).front512, ...sv.flatMap(x => [x.photo, x.src])].filter(remote) as string[]
    if (files.length) await sb.storage.from('products').remove([...new Set(files)])
    onDone()
  }

  return (
    <section>
      <div className="adm-bar"><h1>{isNew ? 'New attire product' : d.name || 'Edit product'}</h1><button type="button" className="ghost" onClick={onDone} disabled={!!busy}>Back to list</button></div>
      <div className="adm-cols">
        <div className="adm-form">
          <label>Name<input id="f-name" value={d.name} maxLength={80} onChange={e => { set('name', e.target.value); if (isNew && !slugTouched.current) set('slug', slugify(e.target.value)) }} /></label>
          <label>Web name (slug)<input id="f-slug" value={d.slug} onChange={e => { slugTouched.current = true; set('slug', slugify(e.target.value)) }} disabled={!isNew} /></label>
          <div className="row">
            <label>Category (tag)<select id="f-category" value={gridCategory(d.category)} onChange={e => set('category', e.target.value as Row['category'])}>
              {ATTIRE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label>Price from (₹)<input id="f-price" inputMode="numeric" value={d.price_from ?? ''} onChange={e => { const v = e.target.value.replace(/\D/g, ''); set('price_from', v ? Math.min(MAX_PRICE, Number(v)) : null) }} placeholder="Empty: price on request" /></label>
          </div>
          <label>Order in the grid<input id="f-sort" inputMode="numeric" value={d.sort} onChange={e => set('sort', Math.min(MAX_SORT, Number(e.target.value.replace(/\D/g, '') || 0)))} /></label>
          <fieldset className="stock"><legend>Stock by size (leave all blank = every size on sale; blank or 0 for a size = sold out)</legend>
            <div className="row5">{['S', 'M', 'L', 'XL', 'XXL'].map(z => (
              <label key={z}>{z}<input id={`f-stock-${z}`} inputMode="numeric" value={d.sizes?.[z] ?? ''} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setD(x => { const n = { ...(x.sizes || {}) }; if (v === '') delete n[z]; else n[z] = Number(v); return { ...x, sizes: n } }) }} /></label>))}</div>
          </fieldset>
          <label>Tagline<input id="f-tagline" value={d.tagline} maxLength={90} onChange={e => set('tagline', e.target.value)} /></label>
          <label>Fabric and make<textarea id="f-fabric" rows={2} value={d.fabric} onChange={e => set('fabric', e.target.value)} /></label>
          <label>Description (optional)<textarea id="f-desc" rows={3} value={d.description} onChange={e => set('description', e.target.value)} /></label>
          <div className="row">
            <label>Fit<input value={d.details.fit ?? ''} onChange={e => setDet('fit', e.target.value)} /></label>
            <label>Delivery<input value={d.details.delivery ?? ''} onChange={e => setDet('delivery', e.target.value)} /></label>
          </div>
          <label className="pub big"><input id="f-published" type="checkbox" checked={d.published} onChange={e => set('published', e.target.checked)} /> Published (visible on the site)</label>
        </div>
        <div className="adm-media">
          <div className="ph-drop" id="ph-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles([...e.dataTransfer.files], Math.max(0, slots.findIndex(s => s.status === 'empty'))) }}>
            <label htmlFor="ph-multi"><b>Add photos</b><span>Drop up to 4 photos here, or choose. They fill the free slots in order. Any photo works, even a busy one: the garment is found, cut out, framed and placed on the velvet.</span></label>
            <input id="ph-multi" type="file" accept="image/*" multiple onChange={e => { const at = slots.findIndex(s => s.status === 'empty'); addFiles([...(e.target.files || [])], at < 0 ? 0 : at); e.target.value = '' }} />
          </div>
          <ol className="ph-slots">
            {slots.map((s, i) => {
              const u = urlOf(s)
              return (
                <li key={i} className={`ph-slot ${s.status}`} data-slot={i + 1} id={`ph-slot-${i + 1}`}>
                  <span className="ph-no">{i + 1}{i === 0 ? ' · card' : ''}</span>
                  <div className="ph-frame">
                    {u && <img src={u} alt={`Photo ${i + 1}`} id={`ph-img-${i + 1}`} />}
                    {s.status === 'empty' && <label className="ph-empty" htmlFor={`ph-in-${i + 1}`}>+ Add photo {i + 1}</label>}
                    {s.status === 'busy' && <div className="ph-busy" role="status"><span className="spin" aria-hidden="true" />{s.step}</div>}
                  </div>
                  <input id={`ph-in-${i + 1}`} type="file" accept="image/*" className="ph-in" onChange={e => { const f = e.target.files?.[0]; if (f) addFiles([f], i); e.target.value = '' }} />
                  {s.bytesIn != null && s.placed?.photo && <span className="ph-size" id={`ph-size-${i + 1}`}>{kb(s.bytesIn)} → {kb(s.placed.photo.size)}</span>}
                  {s.warn.map((w, k) => <span className="ph-warn" key={k} role="status">{w}</span>)}
                  {s.status !== 'empty' && (
                    <div className="ph-btns">
                      <button type="button" className="ghost small" aria-label={`Move photo ${i + 1} earlier`} data-act="left" disabled={i === 0 || !!busy} onClick={() => swap(i, i - 1)}>←</button>
                      <button type="button" className="ghost small" aria-label={`Move photo ${i + 1} later`} data-act="right" disabled={i === SLOTS - 1 || !!busy} onClick={() => swap(i, i + 1)}>→</button>
                      <label className="ghost small btn-like" htmlFor={`ph-in-${i + 1}`}>Replace</label>
                      {s.edit && <button type="button" className="ghost small" data-act="fix" disabled={s.status === 'busy'} onClick={() => setFix(i)}>Fix cut-out</button>}
                      {!s.edit && s.savedSrc && !s.cut && <button type="button" className="ghost small" data-act="adjust" disabled={!!busy} onClick={() => loadSaved(i)}>Adjust framing</button>}
                      <button type="button" className="danger small" onClick={() => remove(i)}>Remove</button>
                    </div>)}
                  {s.cut && s.status !== 'busy' && (
                    <div className="nudges" data-slot={i + 1}>
                      {([['s', 'Size', `${Math.round(s.nudge.s * 100)}%`], ['x', 'Left / right', `${Math.round(s.nudge.x * 100)}`], ['y', 'Up / down', `${Math.round(s.nudge.y * 100)}`]] as const).map(([k, label, val]) => (
                        <div className="nudge" key={k}><span>{label}</span>
                          <button type="button" className="ghost small" aria-label={`Photo ${i + 1} ${label} less`} data-n={`${i + 1}-${k}-minus`} onClick={() => nudge(i, k, s.nudge[k] - STEPS[k])}>−</button>
                          <output>{val}</output>
                          <button type="button" className="ghost small" aria-label={`Photo ${i + 1} ${label} more`} data-n={`${i + 1}-${k}-plus`} onClick={() => nudge(i, k, s.nudge[k] + STEPS[k])}>+</button>
                        </div>))}
                    </div>)}
                </li>)
            })}
          </ol>
          <p className="note">Photos are compressed to about {kb(MAX_BYTES)} each without visible loss. Photo 1 is the card in the shop grid; the others appear in the product's photo gallery.</p>
        </div>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="adm-actions">
        <button type="button" id="f-save" onClick={save} disabled={!!busy || slots.some(s => s.status === 'busy')}>{busy || (isNew ? 'Create product' : 'Save changes')}</button>
        {!isNew && <button type="button" className="danger" onClick={del} disabled={!!busy}>Delete</button>}
      </div>
      {fix !== null && slots[fix]?.edit && <Fixer st={slots[fix].edit!} onDone={st => applyFix(fix, st)} onCancel={() => setFix(null)} />}
    </section>
  )
}
