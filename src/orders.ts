/* Order placing: stored in Supabase (insert-only for the public) when the live catalogue is on, and always sent to the shop on WhatsApp. */
import { CONTACT } from './data'
import type { Line } from './cart'
import { total } from './cart'
import { days, type Delivery } from './delivery'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export type Pay = 'upi' | 'cod' | 'whatsapp'
export type Customer = { name: string; phone: string; address: string; pincode: string }
export const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export const newRef = () => {
  const d = new Date(), a = new Uint8Array(3); crypto.getRandomValues(a)
  return `GF${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${[...a].map(b => b.toString(36).padStart(2, '0')).join('').toUpperCase().slice(0, 4)}`
}
export const normPhone = (s: string) => { const d = s.replace(/\D/g, ''); return d.length === 10 ? `+91${d}` : d.length >= 11 && d.length <= 15 ? `+${d}` : '' }

export const upiLink = (amount: number, ref: string) =>
  `upi://pay?pa=${encodeURIComponent(CONTACT.upiId)}&pn=${encodeURIComponent(CONTACT.upiName)}&am=${amount}&cu=INR&tn=${encodeURIComponent('Order ' + ref)}`

export function message(ref: string, lines: Line[], c: Customer, pay: Pay, del: Delivery | null, utr: string) {
  const items = lines.map(l => `• ${l.name} · size ${l.size} · ${l.qty} × ${inr.format(l.price)}`).join('\n')
  const payTxt = pay === 'cod' ? 'Cash on delivery' : pay === 'upi' ? `UPI${utr ? ` (ref ${utr})` : ''}` : 'Send me a payment link'
  return `Hello, I would like to place order ${ref}.\n\n${items}\n\nTotal: ${inr.format(total(lines))}\nPayment: ${payTxt}\n\nName: ${c.name}\nPhone: ${c.phone}\nAddress: ${c.address}\nPincode: ${c.pincode}${del ? ` (${[del.place, del.state].filter(Boolean).join(', ')}; delivery ${days(del)})` : ''}`
}
export const waLink = (text: string) => `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`

/* returns true when the order was saved online (false = not configured or the request failed; the WhatsApp message is still the order) */
export async function saveOrder(ref: string, lines: Line[], c: Customer, pay: Pay, del: Delivery | null, utr: string): Promise<boolean> {
  if (!URL_ || !KEY) return false
  try {
    const r = await fetch(`${URL_}/rest/v1/orders`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ref, name: c.name, phone: c.phone, address: c.address, pincode: c.pincode, payment: pay, utr: utr || null, total: total(lines),
        delivery: del ? days(del) : null, items: lines.map(l => ({ slug: l.slug, name: l.name, size: l.size, qty: l.qty, price: l.price })) })
    })
    return r.ok
  } catch { return false }
}
