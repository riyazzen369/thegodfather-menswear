/* Shopping cart (this browser only, kept in localStorage). */
import { useSyncExternalStore } from 'react'

export type Line = { key: string; slug: string; name: string; size: string; price: number; qty: number; img: string }
const KEY = 'gf-cart'
const read = (): Line[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(l => l && typeof l.key === 'string' && l.qty > 0 && l.price >= 0) : [] } catch { return [] } }
let lines: Line[] = read()
let open = false
const subs = new Set<() => void>()
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(lines)) } catch { /* private mode */ } subs.forEach(f => f()) }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const MAX_QTY = 10

export const cart = {
  add(l: Omit<Line, 'key'>) {
    const key = `${l.slug}|${l.size}`, cur = lines.find(x => x.key === key)
    lines = cur ? lines.map(x => x.key === key ? { ...x, qty: Math.min(MAX_QTY, x.qty + l.qty) } : x) : [...lines, { ...l, key, qty: Math.min(MAX_QTY, l.qty) }]
    emit()
  },
  setQty(key: string, qty: number) { lines = qty < 1 ? lines.filter(x => x.key !== key) : lines.map(x => x.key === key ? { ...x, qty: Math.min(MAX_QTY, qty) } : x); emit() },
  remove(key: string) { lines = lines.filter(x => x.key !== key); emit() },
  clear() { lines = []; emit() },
  show(v = true) { open = v; subs.forEach(f => f()) }
}
export const useLines = () => useSyncExternalStore(subscribe, () => lines)
export const useCartOpen = () => useSyncExternalStore(subscribe, () => open)
export const total = (l: Line[]) => l.reduce((s, x) => s + x.price * x.qty, 0)
export const count = (l: Line[]) => l.reduce((s, x) => s + x.qty, 0)
