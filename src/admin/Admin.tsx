/* Catalogue admin (/admin/). Supabase Auth, email + password; accounts are created by the owner, there is no sign-up.
   Writes are allowed by RLS only for users in public.admins. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { CATEGORIES } from '../data'
import { liveEnabled, publicUrl, supa, type Row } from '../supa'
import { cutOut, cutFromUrl, place, rawBlob, NUDGE0, type Cut, type Nudge, type Placed } from './normalize'

type Draft = Omit<Row, 'id' | 'updated_at'> & { id?: string; updated_at?: string }
const blank = (sort: number): Draft => ({
  slug: '', name: '', collection: 'premium', category: 'formal', price_from: null, sizes: {}, tagline: '', description: '', fabric: '',
  details: { fit: '', madeToMeasure: '', delivery: '' }, colours: [], front_path: null, extra_paths: [], front_cut_path: null,
  back_path: null, blur: null, nudge: {}, src_paths: {}, sort, published: false
})
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
/* a 512 px wide WebP copy of the vault photo, so the grid and vault cards on phones don't download the 864 px one */
async function smallVariant(photo: Blob): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(photo), w = 512, h = Math.round(bmp.height * w / bmp.width)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    return await new Promise<Blob | null>(res => c.toBlob(b => res(b), 'image/webp', 0.82))
  } catch { return null }
}
const MAX_PRICE = 99_999_999, MAX_SORT = 9999
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export default function Admin() {
  const [sb, setSb] = useState<SupabaseClient | null>(null)
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    let off = () => {}
    supa().then(c => {
      if (!c) { setSession(null); return }
      setSb(c)
      c.auth.getSession().then(({ data }) => setSession(data.session))
      const { data } = c.auth.onAuthStateChange((_e, s) => setSession(s)); off = () => data.subscription.unsubscribe()
    })
    return () => off()
  }, [])
  /* RLS lets an admin read the allow-list (and nobody else), so an empty answer means "signed in, not an admin" */
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const uid = session?.user.id
  useEffect(() => {
    if (!sb || !uid) { setIsAdmin(null); return }
    let dead = false
    sb.from('admins').select('user_id').eq('user_id', uid).maybeSingle().then(({ data, error }) => { if (!dead) setIsAdmin(error ? null : !!data) })
    return () => { dead = true }
  }, [sb, uid])
  if (!liveEnabled) return <Shell><p className="note">This build has no database configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). See docs/ADMIN.md.</p></Shell>
  if (session === undefined || !sb) return <Shell><p className="note">Loading…</p></Shell>
  if (!session) return <Shell><Login sb={sb} /></Shell>
  return <Shell user={session.user.email} onOut={() => sb.auth.signOut()}>{isAdmin === false
    ? <p className="note" id="not-admin">This account is signed in but is not a catalogue admin, so it cannot change anything. Ask the store owner to add it.</p>
    : <><Catalogue sb={sb} /><Orders sb={sb} /></>}</Shell>
}

function Shell({ children, user, onOut }: { children: React.ReactNode; user?: string; onOut?: () => void }) {
  return (
    <div className="adm">
      <header className="adm-top">
        <div><span className="adm-mark">The Godfather</span> <span className="adm-sub">Catalogue</span></div>
        {user && <div className="adm-user"><span>{user}</span> <a href="../" target="_blank" rel="noopener">View site</a> <button type="button" className="ghost" onClick={onOut}>Sign out</button></div>}
      </header>
      <main>{children}</main>
    </div>
  )
}

function Login({ sb }: { sb: SupabaseClient }) {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  return (
    <form className="adm-login" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr('')
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw })
      setBusy(false); if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
    }}>
      <h1>Sign in</h1>
      <label>Email<input id="adm-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input id="adm-password" type="password" autoComplete="current-password" required value={pw} onChange={e => setPw(e.target.value)} /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="note">Accounts are created by the store owner. Forgot your password? Ask them to reset it in Supabase.</p>
    </form>
  )
}

type Order = { id: string; ref: string; name: string; phone: string; address: string; pincode: string; payment: string; utr: string | null; items: { name: string; size: string; qty: number }[]; total: number; delivery: string | null; status: string; created_at: string }
function Orders({ sb }: { sb: SupabaseClient }) {
  const [rows, setRows] = useState<Order[] | null>(null), [err, setErr] = useState('')
  const load = async () => { const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(100); if (error) setErr(error.message); else { setErr(''); setRows(data as Order[]) } }
  useEffect(() => { load() }, [])
  const setStatus = async (o: Order, status: string) => { setRows(l => l && l.map(x => x.id === o.id ? { ...x, status } : x)); const { error } = await sb.from('orders').update({ status }).eq('id', o.id); if (error) { setErr(error.message); load() } }
  return (
    <section id="adm-orders">
      <div className="adm-bar"><h1>Orders {rows && <small>{rows.filter(r => r.status === 'new').length} new · {rows.length} shown</small>}</h1><button type="button" onClick={load}>Refresh</button></div>
      {err && <p className="err" role="alert">{err}</p>}
      {!rows ? <p className="note">Loading…</p> : !rows.length ? <p className="note">No orders yet.</p> : (
        <ul className="adm-list">{rows.map(o => (
          <li key={o.id} data-ref={o.ref}>
            <span className="meta" style={{ gridColumn: '1 / 3' }}><b>{o.ref} · {inr.format(o.total)} · {o.payment.toUpperCase()}{o.utr ? ` (${o.utr})` : ''}</b>
              <span>{o.items.map(i => `${i.name} ${i.size}×${i.qty}`).join(', ')}</span>
              <span>{o.name} · {o.phone} · {o.address}, {o.pincode}{o.delivery ? ` · ${o.delivery}` : ''} · {new Date(o.created_at).toLocaleString('en-IN')}</span></span>
            <select value={o.status} onChange={e => setStatus(o, e.target.value)} aria-label={`Status of ${o.ref}`}>{['new', 'confirmed', 'shipped', 'delivered', 'cancelled'].map(x => <option key={x}>{x}</option>)}</select>
          </li>))}</ul>
      )}
    </section>
  )
}

function Catalogue({ sb }: { sb: SupabaseClient }) {
  const [rows, setRows] = useState<Row[] | null>(null), [err, setErr] = useState('')
  const [edit, setEdit] = useState<Draft | null>(null)
  const load = async () => {
    const { data, error } = await sb.from('products').select('*').order('collection').order('sort').order('name')
    if (error) setErr(error.message); else { setErr(''); setRows(data as Row[]) }
  }
  useEffect(() => { load() }, [])
  const togglePub = async (r: Row) => {
    setRows(l => l && l.map(x => x.id === r.id ? { ...x, published: !r.published } : x))
    const { error } = await sb.from('products').update({ published: !r.published }).eq('id', r.id)
    if (error) { setErr(error.message); load() }
  }
  if (edit) return <Editor sb={sb} draft={edit} onDone={() => { setEdit(null); load() }} />
  const nextSort = rows && rows.length ? Math.max(...rows.map(r => r.sort)) + 10 : 10
  return (
    <section>
      <div className="adm-bar">
        <h1>Products {rows && <small>{rows.filter(r => r.published).length} live · {rows.length} total</small>}</h1>
        <button type="button" id="adm-new" onClick={() => setEdit(blank(nextSort))}>Add product</button>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {!rows ? <p className="note">Loading…</p> : !rows.length ? <p className="note">No products yet.</p> : (
        <ul className="adm-list">
          {rows.map(r => (
            <li key={r.id} className={r.published ? '' : 'draft'} data-slug={r.slug}>
              <span className="thumb" style={r.blur ? { backgroundImage: `url(${r.blur})` } : undefined}>{r.front_path && <img src={publicUrl(r.front_path, r.updated_at)} alt="" loading="lazy" />}</span>
              <span className="meta"><b>{r.name}</b><span>{r.collection === 'premium' ? 'Elite · vault' : 'Attire'} · {CATEGORIES.find(c => c.id === r.category)?.label ?? r.category}{r.price_from != null ? ` · from ${inr.format(r.price_from)}` : ''}{r.back_path ? ' · back photo' : ''}</span></span>
              <label className="pub"><input type="checkbox" checked={r.published} onChange={() => togglePub(r)} /> {r.published ? 'Live' : 'Hidden'}</label>
              <button type="button" className="ghost" onClick={() => setEdit(r)}>Edit</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type Face = { cut: Cut; nudge: Nudge; placed: Placed | null; fresh: boolean }
const STEPS = { s: 0.02, x: 0.01, y: 0.01 }
function Editor({ sb, draft, onDone }: { sb: SupabaseClient; draft: Draft; onDone: () => void }) {
  const [d, setD] = useState<Draft>(draft), [err, setErr] = useState(''), [busy, setBusy] = useState('')
  const [faces, setFaces] = useState<{ front: Face | null; back: Face | null }>({ front: null, back: null })
  const [dropBack, setDropBack] = useState(false)
  const [method, setMethod] = useState('')
  const isNew = !draft.id
  const slugTouched = useRef(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }))
  const setDet = (k: keyof Row['details'], v: string) => setD(x => ({ ...x, details: { ...x.details, [k]: v } }))
  const facesRef = useRef(faces); facesRef.current = faces
  const run = useRef(0)
  /* (re)place both faces: the back is sized to the front's placed box so the flip lines up */
  const layout = async (f: { front: Face | null; back: Face | null }) => {
    const id = ++run.current
    const front = f.front ? { ...f.front, placed: await place(f.front.cut, f.front.nudge, { photo: true }) } : null
    const match = front?.placed?.box ?? (d.nudge as any)?.frontBox
    const back = f.back ? { ...f.back, placed: await place(f.back.cut, f.back.nudge, { photo: false, match }) } : null
    if (id !== run.current) return
    setFaces(old => { for (const o of [old.front?.placed, old.back?.placed]) if (o) { URL.revokeObjectURL(o.cutUrl); o.photoUrl && URL.revokeObjectURL(o.photoUrl) } return { front, back } })
  }
  const pick = async (file: File | undefined, which: 'front' | 'back') => {
    if (!file) return
    if (!/^image\//.test(file.type)) { setErr('Pick an image file.'); return }
    try {
      setErr(''); setBusy('Preparing photo…')
      const cut = await cutOut(file, setBusy)
      setMethod(cut.method === 'ai' ? 'Background removed automatically.' : cut.method === 'alpha' ? 'Transparent cut-out used as is.' : 'Background model unavailable: plain backdrop keyed out. Check the edges.')
      setBusy('Framing…')
      const next = { ...facesRef.current, [which]: { cut, nudge: { ...NUDGE0 }, placed: null, fresh: true } }
      if (which === 'back') setDropBack(false)
      /* editing an existing product's back only: bring in the saved front so the sizes match */
      if (which === 'back' && !next.front && d.src_paths?.front) next.front = { cut: await cutFromUrl(publicUrl(d.src_paths.front)!), nudge: { ...NUDGE0, ...(d.nudge?.front || {}) }, placed: null, fresh: false }
      await layout(next)
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  /* adjust a saved photo without re-uploading */
  const adjustSaved = async (which: 'front' | 'back') => {
    const p = d.src_paths?.[which]; if (!p) return
    try { setBusy('Loading…'); const next = { ...facesRef.current }
      for (const w of ['front', 'back'] as const) if (!next[w] && d.src_paths?.[w] && (w === which || w === 'front')) next[w] = { cut: await cutFromUrl(publicUrl(d.src_paths[w]!)!), nudge: { ...NUDGE0, ...(d.nudge?.[w] || {}) }, placed: null, fresh: false }
      await layout(next) } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  const nudgeT = useRef(0)
  const nudge = (which: 'front' | 'back', k: keyof Nudge, v: number) => {
    const f = facesRef.current[which]; if (!f) return
    const n = { ...f.nudge, [k]: k === 's' ? Math.min(1.4, Math.max(0.6, v)) : Math.min(0.2, Math.max(-0.2, v)) }
    const next = { ...facesRef.current, [which]: { ...f, nudge: n } }
    setFaces(next); facesRef.current = next
    clearTimeout(nudgeT.current); nudgeT.current = window.setTimeout(() => layout(facesRef.current), 120)
  }
  const fp = faces.front?.placed, bp = faces.back?.placed
  const vaultUrl = fp?.photoUrl ?? publicUrl(d.front_path, d.updated_at)
  const frontUrl = fp?.cutUrl ?? publicUrl(d.front_cut_path ?? d.front_path, d.updated_at)
  const backUrl = dropBack ? undefined : bp?.cutUrl ?? publicUrl(d.back_path, d.updated_at)

  const save = async () => {
    const slug = d.slug || slugify(d.name)
    if (!d.name.trim()) return setErr('Give the product a name.')
    if (!slug) return setErr('The name needs at least one letter or number.')
    if (!d.front_path && !fp) return setErr('Add a front photo.')
    setErr('')
    const uploaded: string[] = [] /* files added by THIS save: removed again if anything fails, so no orphans are left in the public bucket */
    try {
      if (!draft.id) { /* new product: check the slug first, before any upload */
        setBusy('Checking…')
        const { data: clash, error: ce } = await sb.from('products').select('id').eq('slug', slug).maybeSingle()
        if (ce) throw ce
        if (clash) return setErr('Another product already uses that web name (slug). Change it and save again.')
      }
      const stamp = Date.now().toString(36), old: string[] = []
      const upload = async (blob: Blob, name: string) => {
        setBusy(`Uploading ${name}…`)
        const path = `${slug}/${name}-${stamp}.webp`
        const { error } = await sb.storage.from('products').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
        if (error) throw error
        uploaded.push(path)
        return path
      }
      const row: Draft = { ...d, slug, name: d.name.trim(), nudge: { ...(d.nudge || {}) }, src_paths: { ...(d.src_paths || {}) } }
      const F = faces.front, B = faces.back
      if (F?.placed) {
        old.push(...[d.front_path, d.front_cut_path].filter(Boolean) as string[])
        row.front_path = await upload(F.placed.photo!, 'front');
        { const sm = await smallVariant(F.placed.photo!); const prev = (d.details as any)?.front512; if (prev) old.push(prev); row.details = { ...row.details, ...(sm ? { front512: await upload(sm, 'front-512') } : {}) } as Row['details']; if (!sm) delete (row.details as any).front512 }
        row.front_cut_path = await upload(F.placed.cut, 'front-cut'); row.blur = F.placed.blur
        row.nudge = { ...row.nudge, front: F.nudge, frontBox: F.placed.box } as Row['nudge']
        if (F.fresh) { if (d.src_paths?.front) old.push(d.src_paths.front); row.src_paths!.front = await upload(await rawBlob(F.cut), 'front-src') }
      }
      if (B?.placed && !dropBack) {
        if (d.back_path) old.push(d.back_path)
        row.back_path = await upload(B.placed.cut, 'back'); row.nudge = { ...row.nudge, back: B.nudge }
        if (B.fresh) { if (d.src_paths?.back) old.push(d.src_paths.back); row.src_paths!.back = await upload(await rawBlob(B.cut), 'back-src') }
      } else if (dropBack && d.back_path) { old.push(d.back_path); if (d.src_paths?.back) old.push(d.src_paths.back); row.back_path = null; delete row.src_paths!.back; delete (row.nudge as any).back }
      setBusy('Saving…')
      const { id, updated_at, ...fields } = row as Draft & { created_at?: string }
      delete (fields as any).created_at
      const { error } = id ? await sb.from('products').update(fields).eq('id', id) : await sb.from('products').insert(fields)
      if (error) throw error
      if (old.length) await sb.storage.from('products').remove(old)
      onDone()
    } catch (e) {
      if (uploaded.length) await sb.storage.from('products').remove(uploaded).catch(() => {})
      const m = (e as Error).message || 'Something went wrong.'
      setErr(m.includes('duplicate key') ? 'Another product already uses that web name (slug).' : /exceeds|out of range|integer/i.test(m) ? 'One of the numbers is too large. Check Price and Order.' : /row-level security|not allowed|403/i.test(m) ? 'This account is not allowed to change the catalogue.' : m)
    }
    finally { setBusy('') }
  }
  const del = async () => {
    if (!draft.id || !confirm(`Delete “${draft.name}”? This cannot be undone.`)) return
    setBusy('Deleting…')
    const { error } = await sb.from('products').delete().eq('id', draft.id)
    if (error) { setErr(error.message); setBusy(''); return }
    const files = [draft.front_path, draft.front_cut_path, draft.back_path, draft.src_paths?.front, draft.src_paths?.back, ...draft.extra_paths.map(e => e.path)].filter(Boolean) as string[]
    if (files.length) await sb.storage.from('products').remove(files)
    onDone()
  }
  const Nudges = ({ which }: { which: 'front' | 'back' }) => {
    const f = faces[which]
    if (!f) return d.src_paths?.[which] ? <button type="button" className="ghost small" onClick={() => adjustSaved(which)} disabled={!!busy}>Adjust framing</button> : null
    const n = f.nudge
    return (
      <div className="nudges" data-face={which}>
        {([['s', 'Size', `${Math.round(n.s * 100)}%`], ['x', 'Left / right', `${Math.round(n.x * 100)}`], ['y', 'Up / down', `${Math.round(n.y * 100)}`]] as const).map(([k, label, val]) => (
          <div className="nudge" key={k}><span>{label}</span>
            <button type="button" className="ghost small" aria-label={`${which} ${label} less`} data-n={`${which}-${k}-minus`} onClick={() => nudge(which, k, n[k] - STEPS[k])}>−</button>
            <output>{val}</output>
            <button type="button" className="ghost small" aria-label={`${which} ${label} more`} data-n={`${which}-${k}-plus`} onClick={() => nudge(which, k, n[k] + STEPS[k])}>+</button>
          </div>))}
        <button type="button" className="ghost small" onClick={() => { const next = { ...faces, [which]: { ...f, nudge: { ...NUDGE0 } } }; layout(next) }}>Reset</button>
      </div>
    )
  }
  return (
    <section className="adm-edit">
      <div className="adm-bar"><h1>{isNew ? 'New product' : d.name || 'Edit product'}</h1><button type="button" className="ghost" onClick={onDone} disabled={!!busy}>Back to list</button></div>
      <div className="adm-cols">
        <div className="adm-form">
          <label>Name<input id="f-name" value={d.name} maxLength={80} onChange={e => { set('name', e.target.value); if (isNew && !slugTouched.current) set('slug', slugify(e.target.value)) }} /></label>
          <label>Web name (slug)<input id="f-slug" value={d.slug} onChange={e => { slugTouched.current = true; set('slug', slugify(e.target.value)) }} disabled={!isNew} /></label>
          <div className="row">
            <label>Collection<select id="f-collection" value={d.collection} onChange={e => set('collection', e.target.value as Row['collection'])}>
              <option value="premium">Elite (vault + attire collection)</option><option value="attire">Attire (attire collection only)</option></select></label>
            <label>Category<select id="f-category" value={d.category} onChange={e => set('category', e.target.value as Row['category'])}>
              {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          </div>
          <div className="row">
            <label>Price from (₹)<input id="f-price" inputMode="numeric" value={d.price_from ?? ''} onChange={e => { const v = e.target.value.replace(/\D/g, ''); set('price_from', v ? Math.min(MAX_PRICE, Number(v)) : null) }} placeholder="Leave empty: price on request" /></label>
            <label>Order<input id="f-sort" inputMode="numeric" value={d.sort} onChange={e => set('sort', Math.min(MAX_SORT, Number(e.target.value.replace(/\D/g, '') || 0)))} /></label>
          </div>
          <fieldset className="stock"><legend>Stock by size (leave all blank = every size on sale; blank or 0 for a size = sold out)</legend>
            <div className="row5">{['S', 'M', 'L', 'XL', 'XXL'].map(z => (
              <label key={z}>{z}<input id={`f-stock-${z}`} inputMode="numeric" value={d.sizes?.[z] ?? ''} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setD(x => { const n = { ...(x.sizes || {}) }; if (v === '') delete n[z]; else n[z] = Number(v); return { ...x, sizes: n } }) }} /></label>
            ))}</div>
          </fieldset>
          <label>Tagline<input id="f-tagline" value={d.tagline} maxLength={90} onChange={e => set('tagline', e.target.value)} /></label>
          <label>Fabric and make<textarea id="f-fabric" rows={2} value={d.fabric} onChange={e => set('fabric', e.target.value)} /></label>
          <label>Description (optional)<textarea id="f-desc" rows={3} value={d.description} onChange={e => set('description', e.target.value)} /></label>
          <div className="row">
            <label>Fit<input value={d.details.fit ?? ''} onChange={e => setDet('fit', e.target.value)} /></label>
            <label>Made to measure<input value={d.details.madeToMeasure ?? ''} onChange={e => setDet('madeToMeasure', e.target.value)} /></label>
          </div>
          <label>Delivery<input value={d.details.delivery ?? ''} onChange={e => setDet('delivery', e.target.value)} /></label>
          <label className="pub big"><input id="f-published" type="checkbox" checked={d.published} onChange={e => set('published', e.target.checked)} /> Published (visible on the site)</label>
        </div>
        <div className="adm-media">
          <div className="pickers">
            <div><Drop label="Front photo" id="f-front" onFile={f => pick(f, 'front')} has={!!frontUrl} /><Nudges which="front" /></div>
            <div><Drop label="Back photo (optional)" id="f-back" onFile={f => pick(f, 'back')} has={!!backUrl} onClear={backUrl ? () => { setFaces(x => ({ ...x, back: null })); setDropBack(true) } : undefined} /><Nudges which="back" /></div>
          </div>
          <p className="note">Any photo works, even a phone shot on a bed: the background is removed, the piece is cropped, centred on the house frame and lightly warmed, and the back is sized to the front. {method && <b id="f-method">{method}</b>}</p>
          {frontUrl ? (
            <div className="previews">
              <figure className="vault-prev"><div className="vault-frame">{vaultUrl && <img id="prev-vault" src={vaultUrl} alt="In the vault" />}</div><figcaption>In the vault</figcaption></figure>
              <FlipPreview front={frontUrl} back={backUrl} />
            </div>
          ) : <div className="flip-empty">Add a front photo to preview</div>}
        </div>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="adm-actions">
        <button type="button" id="f-save" onClick={save} disabled={!!busy}>{busy || (isNew ? 'Create product' : 'Save changes')}</button>
        {!isNew && <button type="button" className="danger" onClick={del} disabled={!!busy}>Delete</button>}
      </div>
    </section>
  )
}

function Drop({ label, id, onFile, has, onClear }: { label: string; id: string; onFile: (f: File | undefined) => void; has: boolean; onClear?: () => void }) {
  const [over, setOver] = useState(false)
  return (
    <div className={`drop ${over ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]) }}>
      <label htmlFor={id}>{label}<span>{has ? 'Replace: drop or choose' : 'Drop an image or choose'}</span></label>
      <input id={id} type="file" accept="image/*" onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      {onClear && <button type="button" className="ghost small" onClick={onClear}>Remove</button>}
    </div>
  )
}

/* the same drag-to-flip idea as the site's inspect view, small */
function FlipPreview({ front, back }: { front: string; back?: string }) {
  const card = useRef<HTMLDivElement>(null), st = useRef({ a: 0, x0: 0, a0: 0, on: false })
  const [face, setFace] = useState<'front' | 'back'>('front')
  const paint = (a: number, anim: boolean) => { const c = card.current; if (!c) return; c.style.transition = anim ? 'transform .5s cubic-bezier(.2,.8,.2,1)' : 'none'; c.style.transform = `rotateY(${a}deg)` }
  const snap = (a: number) => { const t = Math.round(a / 180) * 180; st.current.a = t; paint(t, true); setFace(((t / 180) % 2 + 2) % 2 ? 'back' : 'front') }
  const mask = useMemo(() => ({ WebkitMaskImage: `url(${front})`, maskImage: `url(${front})` }) as React.CSSProperties, [front])
  return (
    <div className="flip-prev">
      <div className="flip-prev-stage" onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); Object.assign(st.current, { on: true, x0: e.clientX, a0: st.current.a }) }}
        onPointerMove={e => { if (!st.current.on) return; st.current.a = st.current.a0 + (e.clientX - st.current.x0) * 0.8; paint(st.current.a, false) }}
        onPointerUp={() => { st.current.on = false; snap(st.current.a) }} onPointerCancel={() => { st.current.on = false; snap(st.current.a) }}>
        <div className="flip-prev-plinth" aria-hidden="true" />
        <div className="flip-prev-card" ref={card}>
          <div className="face f"><img src={front} alt="Front preview" draggable={false} /></div>
          <div className="face b">{back ? <img src={back} alt="Back preview" draggable={false} /> : <div className="plain" style={mask} />}</div>
        </div>
      </div>
      <div className="flip-prev-bar"><span>{face === 'front' ? 'Front' : 'Back'} · drag to flip</span><button type="button" className="ghost small" onClick={() => snap(st.current.a + 180)}>Flip</button></div>
    </div>
  )
}
