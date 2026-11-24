/* Live product catalogue (Supabase). Read-only on the public site: the anon key + RLS only return published rows.
   Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or when the database is unreachable, the bundled ITEMS are used. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { BUNDLED, ITEMS, type Item, type Category } from './data'
import { REMOTE_LQIP, REMOTE_SMALL } from './Pic'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const liveEnabled = !!(URL_ && KEY) && !new URLSearchParams(location.search).has('bundled')
let client: Promise<SupabaseClient> | null = null
export function supa(): Promise<SupabaseClient | null> {
  if (!liveEnabled) return Promise.resolve(null)
  return client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL_!, KEY!, { auth: { persistSession: true, storageKey: 'gf-admin' } }))
}
export type Row = {
  id: string; slug: string; name: string; collection: 'premium' | 'attire'; category: Category; price_from: number | null; sizes?: Record<string, number> | null
  tagline: string; description: string; fabric: string; details: Partial<Item['details']>; colours: Item['colours']
  front_path: string | null; extra_paths: { path: string; alt?: string }[]; front_cut_path: string | null; back_path: string | null; blur: string | null
  nudge?: { front?: { s: number; x: number; y: number }; back?: { s: number; x: number; y: number }; frontBox?: { w: number; h: number } }; src_paths?: { front?: string; back?: string }
  sort: number; published: boolean; updated_at: string
}
export const publicUrl = (path: string | null, v?: string) => path ? `${URL_}/storage/v1/object/public/products/${path}${v ? `?v=${encodeURIComponent(v)}` : ''}` : undefined
const DEF = { fit: 'Tailored to you.', madeToMeasure: 'Made to measure in the house.', delivery: 'Ask us for timings.' }
export function toItem(r: Row): Item {
  const v = r.updated_at, front = publicUrl(r.front_path, v)
  return {
    slug: r.slug, collection: r.collection, category: r.category, name: r.name, tagline: r.tagline, fabric: r.fabric || r.description,
    description: r.description, price: r.price_from, sizes: r.sizes && typeof r.sizes === 'object' ? r.sizes : {}, colours: Array.isArray(r.colours) ? r.colours : [],
    images: front ? [{ src: front, alt: `${r.name}, front`, source: 'store photo' as const },
      ...(Array.isArray(r.extra_paths) ? r.extra_paths : []).map(e => ({ src: publicUrl(e.path, v)!, alt: e.alt || r.name, source: 'store photo' as const }))] : [],
    cut: publicUrl(r.front_cut_path, v), back: publicUrl(r.back_path, v), blur: r.blur || undefined,
    details: { ...DEF, ...(r.details || {}) }
  }
}
const order = (a: Row, b: Row) => (a.collection === b.collection ? 0 : a.collection === 'premium' ? -1 : 1) || a.sort - b.sort || a.name.localeCompare(b.name)
/* One plain REST read with the anon key (no supabase-js needed, so the store's first paint never loads the 217 kB client).
   RLS only returns published rows. ok=false means the request failed or timed out (not the same as an empty catalogue). */
export type Fetched = { ok: boolean; rows: Row[] }
async function readOnce(timeoutMs: number): Promise<Fetched> {
  if (!liveEnabled) return { ok: false, rows: [] }
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(`${URL_}/rest/v1/products?select=*&published=eq.true`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` }, signal: ctl.signal })
    if (!r.ok) return { ok: false, rows: [] }
    const data = await r.json()
    if (!Array.isArray(data)) return { ok: false, rows: [] }
    return { ok: true, rows: (data as Row[]).filter(x => x.front_path).sort(order) }
  } catch { return { ok: false, rows: [] } } finally { clearTimeout(t) }
}
/* concurrent callers share one request (start-up, realtime and tab-focus refetches used to double up) */
let inflight: Promise<Fetched> | null = null
export const fetchCatalogue = (timeoutMs = 8000): Promise<Fetched> => inflight ??= readOnce(timeoutMs).finally(() => { inflight = null })
const keyOf = (l: Item[]) => l.map(i => `${i.slug ?? i.name}:${i.collection ?? 'premium'}`).join('|')
/* what would apply() do? 'same' | 'content' (same pieces, new data) | 'structure' (pieces added/removed/moved). Does not change anything. */
export function peek(rows: Row[] | null): 'same' | 'content' | 'structure' {
  const next = rows ? rows.map(toItem) : BUNDLED
  if (JSON.stringify(next) === JSON.stringify(ITEMS)) return 'same'
  return keyOf(next) !== keyOf(ITEMS) ? 'structure' : 'content'
}
/* swap the catalogue in place; returns the same answer as peek() */
export function apply(rows: Row[] | null): 'same' | 'content' | 'structure' {
  const kind = peek(rows); if (kind === 'same') return kind
  const next = rows ? rows.map(toItem) : BUNDLED
  ITEMS.splice(0, ITEMS.length, ...next)
  for (const it of next) if (it.blur && it.images[0]) REMOTE_LQIP.set(it.images[0].src, it.blur)
  for (const r of rows ?? []) { const sm = (r.details as { front512?: string } | null)?.front512; if (sm && r.front_path) REMOTE_SMALL.set(publicUrl(r.front_path, r.updated_at)!, publicUrl(sm, r.updated_at)!) }
  return kind
}
/* realtime ping: calls onChange when the revision row changes and once the channel is SUBSCRIBED (closes the gap between the first read and the subscription).
   Loads supabase-js, so call it after the first interaction, not at start-up. Cleanup is safe to call at any time, even before it resolves. */
export function subscribe(onChange: () => void): () => void {
  let dead = false, undo = () => {}
  supa().then(c => {
    if (!c || dead) return
    const ch = c.channel('products-live-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalogue_rev' }, onChange)
      .subscribe(status => { if (status === 'SUBSCRIBED') onChange() })
    undo = () => { c.removeChannel(ch) }
    if (dead) undo()
  })
  return () => { dead = true; undo() }
}
