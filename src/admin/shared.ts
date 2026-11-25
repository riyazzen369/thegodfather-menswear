/* Shared by the admin editors. */
import type { Row } from '../supa'
export type Draft = Omit<Row, 'id' | 'updated_at'> & { id?: string; updated_at?: string }
export type Kind = 'premium' | 'attire'
export const CAP: Record<Kind, number> = { premium: 12, attire: 45 }
export const KIND_NAME: Record<Kind, string> = { premium: 'Elite Wardrobe', attire: 'Attire Collection' }
export const MAX_PRICE = 99_999_999, MAX_SORT = 9999
export const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
export const blank = (sort: number, collection: Kind = 'premium'): Draft => ({
  slug: '', name: '', collection, category: collection === 'attire' ? 'formals' : 'formal', price_from: null, sizes: {}, tagline: '', description: '', fabric: '',
  details: { fit: '', madeToMeasure: '', delivery: '' }, colours: [], front_path: null, extra_paths: [], front_cut_path: null,
  back_path: null, blur: null, nudge: {}, src_paths: {}, sort, published: false
})
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
