/* Live product catalogue (Supabase). Read-only on the public site: the anon key + RLS only return published rows.
   Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or when the database is unreachable, the bundled ITEMS are used. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { BUNDLED, ITEMS, type Item, type Category } from './data'
import { REMOTE_LQIP } from './Pic'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const liveEnabled = !!(URL_ && KEY) && !new URLSearchParams(location.search).has('bundled')
let client: Promise<SupabaseClient> | null = null
export function supa(): Promise<SupabaseClient | null> {
  if (!liveEnabled) return Promise.resolve(null)
  return client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL_!, KEY!, { auth: { persistSession: true, storageKey: 'gf-admin' } }))
}
export type Row = {
  id: string; slug: string; name: string; collection: 'premium' | 'attire'; category: Category; price_from: number | null
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
    description: r.description, price: r.price_from, colours: Array.isArray(r.colours) ? r.colours : [],
    images: front ? [{ src: front, alt: `${r.name}, front`, source: 'store photo' as const },
      ...(Array.isArray(r.extra_paths) ? r.extra_paths : []).map(e => ({ src: publicUrl(e.path, v)!, alt: e.alt || r.name, source: 'store photo' as const }))] : [],
    cut: publicUrl(r.front_cut_path, v), back: publicUrl(r.back_path, v), blur: r.blur || undefined,
    details: { ...DEF, ...(r.details || {}) }
  }
}
const order = (a: Row, b: Row) => (a.collection === b.collection ? 0 : a.collection === 'premium' ? -1 : 1) || a.sort - b.sort || a.name.localeCompare(b.name)
export async function fetchRows(timeoutMs = 2500): Promise<Row[] | null> {
  const c = await supa(); if (!c) return null
  const q = c.from('products').select('*').eq('published', true)
  const r = await Promise.race([q, new Promise<null>(res => setTimeout(() => res(null), timeoutMs))])
  if (!r || (r as any).error) return null
  const rows = ((r as any).data as Row[]).filter(x => x.front_path)
  return rows.length ? rows.sort(order) : null
}
/* swap the catalogue in place; returns 'same' | 'content' (same pieces, new data) | 'structure' (pieces added/removed/moved) */
export function apply(rows: Row[] | null): 'same' | 'content' | 'structure' {
  const next = rows ? rows.map(toItem) : BUNDLED
  const key = (l: Item[]) => l.map(i => `${i.slug ?? i.name}:${i.collection ?? 'premium'}`).join('|')
  const sig = (l: Item[]) => JSON.stringify(l)
  if (sig(next) === sig(ITEMS)) return 'same'
  const structural = key(next) !== key(ITEMS)
  ITEMS.splice(0, ITEMS.length, ...next)
  for (const it of next) if (it.blur && it.images[0]) REMOTE_LQIP.set(it.images[0].src, it.blur)
  return structural ? 'structure' : 'content'
}
export async function subscribe(onRows: (rows: Row[] | null) => void) {
  const c = await supa(); if (!c) return () => {}
  let t = 0
  const refetch = () => { clearTimeout(t); t = window.setTimeout(async () => onRows(await fetchRows(6000)), 250) }
  const ch = c.channel('products-live').on('postgres_changes', { event: '*', schema: 'public', table: 'catalogue_rev' }, refetch).subscribe()
  /* safety net: re-read when the tab comes back */
  const vis = () => { if (document.visibilityState === 'visible') refetch() }
  document.addEventListener('visibilitychange', vis)
  return () => { c.removeChannel(ch); document.removeEventListener('visibilitychange', vis) }
}
