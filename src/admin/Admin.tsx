/* Catalogue admin (/admin/). Supabase Auth, email + password; accounts are created by the owner, there is no sign-up.
   Writes are allowed by RLS only for users in public.admins. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { CATEGORIES } from '../data'
import { liveEnabled, publicUrl, supa, type Row } from '../supa'
import { prepare } from './image'

type Draft = Omit<Row, 'id' | 'updated_at'> & { id?: string; updated_at?: string }
const blank = (sort: number): Draft => ({
  slug: '', name: '', collection: 'premium', category: 'formal', price_from: null, tagline: '', description: '', fabric: '',
  details: { fit: '', madeToMeasure: '', delivery: '' }, colours: [], front_path: null, extra_paths: [], front_cut_path: null,
  back_path: null, blur: null, sort, published: false
})
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
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
  if (!liveEnabled) return <Shell><p className="note">This build has no database configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). See docs/ADMIN.md.</p></Shell>
  if (session === undefined || !sb) return <Shell><p className="note">Loading…</p></Shell>
  if (!session) return <Shell><Login sb={sb} /></Shell>
  return <Shell user={session.user.email} onOut={() => sb.auth.signOut()}><Catalogue sb={sb} /></Shell>
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
              <span className="meta"><b>{r.name}</b><span>{r.collection === 'premium' ? 'Premium · vault' : 'Attire'} · {CATEGORIES.find(c => c.id === r.category)?.label ?? r.category}{r.price_from != null ? ` · from ${inr.format(r.price_from)}` : ''}{r.back_path ? ' · back photo' : ''}</span></span>
              <label className="pub"><input type="checkbox" checked={r.published} onChange={() => togglePub(r)} /> {r.published ? 'Live' : 'Hidden'}</label>
              <button type="button" className="ghost" onClick={() => setEdit(r)}>Edit</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type Pending = { blob: Blob; blur: string; url: string }
function Editor({ sb, draft, onDone }: { sb: SupabaseClient; draft: Draft; onDone: () => void }) {
  const [d, setD] = useState<Draft>(draft), [err, setErr] = useState(''), [busy, setBusy] = useState('')
  const [front, setFront] = useState<Pending | null>(null), [back, setBack] = useState<Pending | null>(null)
  const [dropBack, setDropBack] = useState(false)
  const isNew = !draft.id
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }))
  const setDet = (k: keyof Row['details'], v: string) => setD(x => ({ ...x, details: { ...x.details, [k]: v } }))
  useEffect(() => () => { front && URL.revokeObjectURL(front.url); back && URL.revokeObjectURL(back.url) }, [front, back])
  const pick = async (f: File | undefined, which: 'front' | 'back') => {
    if (!f) return
    if (!/^image\//.test(f.type)) { setErr('Pick an image file.'); return }
    try { setBusy('Preparing image…'); const p = await prepare(f); const v = { ...p, url: URL.createObjectURL(p.blob) }; which === 'front' ? setFront(v) : (setBack(v), setDropBack(false)); setErr('') }
    catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  const frontUrl = front?.url ?? publicUrl(d.front_cut_path ?? d.front_path, d.updated_at)
  const backUrl = dropBack ? undefined : back?.url ?? publicUrl(d.back_path, d.updated_at)

  const save = async () => {
    const slug = d.slug || slugify(d.name)
    if (!d.name.trim()) return setErr('Give the product a name.')
    if (!slug) return setErr('The name needs at least one letter or number.')
    if (!d.front_path && !front) return setErr('Add a front photo.')
    setErr('')
    try {
      const stamp = Date.now().toString(36), old: string[] = []
      const upload = async (p: Pending, name: string) => {
        setBusy(`Uploading ${name} photo…`)
        const path = `${slug}/${name}-${stamp}.webp`
        const { error } = await sb.storage.from('products').upload(path, p.blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
        if (error) throw error
        return path
      }
      const row: Draft = { ...d, slug, name: d.name.trim() }
      if (front) { if (d.front_path) old.push(d.front_path); if (d.front_cut_path) old.push(d.front_cut_path); row.front_path = await upload(front, 'front'); row.front_cut_path = null; row.blur = front.blur }
      if (back) { if (d.back_path) old.push(d.back_path); row.back_path = await upload(back, 'back') }
      else if (dropBack && d.back_path) { old.push(d.back_path); row.back_path = null }
      setBusy('Saving…')
      const { id, updated_at, ...fields } = row as Draft & { created_at?: string }
      delete (fields as any).created_at
      const { error } = id ? await sb.from('products').update(fields).eq('id', id) : await sb.from('products').insert(fields)
      if (error) throw error
      if (old.length) await sb.storage.from('products').remove(old)
      onDone()
    } catch (e) { setErr((e as Error).message.includes('duplicate key') ? 'Another product already uses that web name (slug).' : (e as Error).message) }
    finally { setBusy('') }
  }
  const del = async () => {
    if (!draft.id || !confirm(`Delete “${draft.name}”? This cannot be undone.`)) return
    setBusy('Deleting…')
    const { error } = await sb.from('products').delete().eq('id', draft.id)
    if (error) { setErr(error.message); setBusy(''); return }
    const files = [draft.front_path, draft.front_cut_path, draft.back_path, ...draft.extra_paths.map(e => e.path)].filter(Boolean) as string[]
    if (files.length) await sb.storage.from('products').remove(files)
    onDone()
  }
  return (
    <section className="adm-edit">
      <div className="adm-bar"><h1>{isNew ? 'New product' : d.name || 'Edit product'}</h1><button type="button" className="ghost" onClick={onDone} disabled={!!busy}>Back to list</button></div>
      <div className="adm-cols">
        <div className="adm-form">
          <label>Name<input id="f-name" value={d.name} maxLength={80} onChange={e => { set('name', e.target.value); if (isNew) set('slug', slugify(e.target.value)) }} /></label>
          <label>Web name (slug)<input id="f-slug" value={d.slug} onChange={e => set('slug', slugify(e.target.value))} disabled={!isNew} /></label>
          <div className="row">
            <label>Collection<select id="f-collection" value={d.collection} onChange={e => set('collection', e.target.value as Row['collection'])}>
              <option value="premium">Premium (vault + attire tour)</option><option value="attire">Attire (attire tour only)</option></select></label>
            <label>Category<select id="f-category" value={d.category} onChange={e => set('category', e.target.value as Row['category'])}>
              {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          </div>
          <div className="row">
            <label>Price from (₹)<input id="f-price" inputMode="numeric" value={d.price_from ?? ''} onChange={e => { const v = e.target.value.replace(/\D/g, ''); set('price_from', v ? Number(v) : null) }} placeholder="Leave empty: price on request" /></label>
            <label>Order<input id="f-sort" inputMode="numeric" value={d.sort} onChange={e => set('sort', Number(e.target.value.replace(/\D/g, '') || 0))} /></label>
          </div>
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
            <Drop label="Front photo" id="f-front" onFile={f => pick(f, 'front')} has={!!frontUrl} />
            <Drop label="Back photo (optional)" id="f-back" onFile={f => pick(f, 'back')} has={!!backUrl} onClear={backUrl ? () => { setBack(null); setDropBack(true) } : undefined} />
          </div>
          <p className="note">Photos are resized to 1600px WebP in your browser before upload. A plain backdrop or a transparent cut-out looks best. No back photo: the site shows a plain back made from the front outline.</p>
          {frontUrl ? <FlipPreview front={frontUrl} back={backUrl} /> : <div className="flip-empty">Add a front photo to preview</div>}
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
        <div className="flip-prev-card" ref={card}>
          <div className="face f"><img src={front} alt="Front preview" draggable={false} /></div>
          <div className="face b">{back ? <img src={back} alt="Back preview" draggable={false} /> : <div className="plain" style={mask} />}</div>
        </div>
      </div>
      <div className="flip-prev-bar"><span>{face === 'front' ? 'Front' : 'Back'} · drag to flip</span><button type="button" className="ghost small" onClick={() => snap(st.current.a + 180)}>Flip</button></div>
    </div>
  )
}
