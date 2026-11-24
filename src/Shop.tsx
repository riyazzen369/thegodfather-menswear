/* Product-sheet buying panel (size, quantity, pincode check, add to cart / buy) and the cart drawer with checkout. */
import { useEffect, useRef, useState } from 'react'
import { cart, count, MAX_QTY, total, useCartOpen, useLines } from './cart'
import { CONTACT, type Item } from './data'
import { checkPin, days, validPin, type Delivery } from './delivery'
import { inr, message, newRef, normPhone, saveOrder, upiLink, waLink, type Pay } from './orders'
import { WA_ICON } from './icons'

export const SIZES = ['S', 'M', 'L', 'XL', 'XXL']
/* a size is on sale when the admin has stock for it; with no stock figures at all, every size is offered */
export const sizeStock = (it: Item, s: string) => { const t = it.sizes && Object.keys(it.sizes).length ? it.sizes : null; return t ? Number(t[s] ?? 0) : Infinity }

const PIN_KEY = 'gf-pin'
const loadPin = () => { try { return localStorage.getItem(PIN_KEY) || '' } catch { return '' } }

/* the pincode check, shared by the product panel and the cart */
function PinCheck({ id, onResult }: { id: string; onResult?: (d: Delivery | null) => void }) {
  const [pin, setPin] = useState(loadPin), [res, setRes] = useState<Delivery | null>(null), [state, setState] = useState<'idle' | 'busy' | 'bad'>('idle')
  const ctl = useRef<AbortController | undefined>(undefined)
  const run = async (p: string) => {
    if (!validPin(p)) { setState('bad'); setRes(null); onResult?.(null); return }
    ctl.current?.abort(); ctl.current = new AbortController(); setState('busy')
    const d = await checkPin(p, ctl.current.signal)
    if (!d) { setState('bad'); setRes(null); onResult?.(null); return }
    setState('idle'); setRes(d); onResult?.(d)
    try { localStorage.setItem(PIN_KEY, p) } catch { /* private mode */ }
  }
  useEffect(() => { if (validPin(pin)) run(pin); return () => ctl.current?.abort() }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pin">
      <label htmlFor={id}>Check delivery to your pincode</label>
      <div className="pin-row">
        <input id={id} inputMode="numeric" autoComplete="postal-code" maxLength={6} placeholder="6-digit pincode" value={pin}
          onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setPin(v); setRes(null); setState('idle'); onResult?.(null); if (v.length === 6) run(v) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); run(pin) } }} aria-describedby={`${id}-out`} />
        <button type="button" className="btn ghost" onClick={() => run(pin)} disabled={state === 'busy'}>{state === 'busy' ? 'Checking…' : 'Check'}</button>
      </div>
      <p id={`${id}-out`} className={`pin-out ${state === 'bad' ? 'bad' : res ? 'ok' : ''}`} role="status">
        {state === 'bad' ? 'Please enter a valid 6-digit Indian pincode.'
          : res ? <>Delivery to <b>{[res.place, res.state].filter(Boolean).join(', ')}</b> {res.pin} in <b>{days(res)}</b>.</> : 'We deliver all over India in 1 to 7 days.'}
      </p>
    </div>
  )
}

export function ShopBuy({ item }: { item: Item }) {
  const [size, setSize] = useState(''), [qty, setQty] = useState(1), [note, setNote] = useState('')
  useEffect(() => { setSize(''); setQty(1); setNote('') }, [item])
  if (item.price == null) return null
  const stock = size ? sizeStock(item, size) : Infinity
  const max = Math.min(MAX_QTY, stock)
  const line = () => {
    if (!size) { setNote('Please choose a size.'); return null }
    setNote('')
    return { slug: item.slug ?? item.name, name: item.name, size, price: item.price!, qty: Math.min(qty, max), img: item.images[0]?.src ?? '' }
  }
  return (
    <div className="shop" id="shop">
      <p className="shop-price"><b>{inr.format(item.price)}</b></p>
      <fieldset className="sizes">
        <legend>Size</legend>
        <div className="size-row" role="radiogroup" aria-label="Size">
          {SIZES.map(s => { const out = sizeStock(item, s) <= 0
            return <button type="button" key={s} role="radio" aria-checked={size === s} disabled={out} className={`chip ${size === s ? 'on' : ''}`} data-size={s}
              title={out ? 'Out of stock' : undefined} onClick={() => { setSize(s); setQty(q => Math.min(q, Math.min(MAX_QTY, sizeStock(item, s)))); setNote('') }}>{s}</button> })}
        </div>
        {SIZES.every(s => sizeStock(item, s) <= 0) && <p className="pin-out bad">Currently out of stock. Message us for the next batch.</p>}
        {size && Number.isFinite(stock) && stock <= 3 && <p className="pin-out">Only {stock} left in {size}.</p>}
      </fieldset>
      <div className="qty" role="group" aria-label="Quantity">
        <span>Quantity</span>
        <button type="button" aria-label="Fewer" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
        <output aria-live="polite">{qty}</output>
        <button type="button" aria-label="More" onClick={() => setQty(q => Math.min(max, q + 1))}>+</button>
      </div>
      <PinCheck id="shop-pin" />
      {note && <p className="pin-out bad" role="alert">{note}</p>}
      <div className="buy-row">
        <button type="button" className="btn ghost" id="add-cart" onClick={() => { const l = line(); if (l) { cart.add(l); cart.show() } }}>Add to cart</button>
        <button type="button" className="btn primary" id="buy-now" onClick={() => { const l = line(); if (l) { cart.add(l); cart.show() } }}>Buy now</button>
      </div>
    </div>
  )
}

export function CartButton({ hidden }: { hidden?: boolean }) {
  const lines = useLines(), n = count(lines)
  if (!n || hidden) return null
  return <button type="button" className="cart-fab" id="cart-fab" onClick={() => cart.show()} aria-label={`Open cart, ${n} item${n > 1 ? 's' : ''}`}>Cart <b>{n}</b></button>
}

export function CartDrawer() {
  const open = useCartOpen(), lines = useLines()
  const [step, setStep] = useState<'cart' | 'details' | 'done'>('cart')
  const [c, setC] = useState({ name: '', phone: '', address: '', pincode: loadPin() }), [pay, setPay] = useState<Pay>('cod'), [utr, setUtr] = useState('')
  const [del, setDel] = useState<Delivery | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ ref: string; saved: boolean; wa: string } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const upi = !!CONTACT.upiId
  useEffect(() => { if (open) { setErr(''); if (!lines.length && step !== 'done') setStep('cart'); setTimeout(() => panel.current?.focus(), 30) } }, [open])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
      else if (e.key === 'Tab' && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),textarea,[tabindex="0"]')].filter(x => x.offsetParent !== null)
        if (!f.length) return
        if (e.shiftKey && (document.activeElement === f[0] || document.activeElement === panel.current)) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
      } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) })
  if (!open) return null
  const sum = total(lines)
  function close() { cart.show(false); if (step === 'done') { setStep('cart'); setDone(null) } }
  async function place() {
    const phone = normPhone(c.phone), name = c.name.trim(), address = c.address.trim()
    if (name.length < 2) return setErr('Please enter your name.')
    if (!phone) return setErr('Please enter a valid 10-digit mobile number.')
    if (address.length < 8) return setErr('Please enter your full delivery address.')
    if (!validPin(c.pincode)) return setErr('Please enter a valid 6-digit pincode.')
    if (pay === 'upi' && utr.trim().length < 6) return setErr('After paying, enter the UPI reference (UTR) so we can confirm your payment.')
    setErr(''); setBusy(true)
    const ref = newRef(), cust = { ...c, name, phone, address }
    const saved = await saveOrder(ref, lines, cust, pay, del, utr.trim())
    const wa = waLink(message(ref, lines, cust, pay, del, utr.trim()))
    setBusy(false); setDone({ ref, saved, wa }); setStep('done'); cart.clear()
    window.open(wa, '_blank', 'noopener')
  }
  const field = (k: 'name' | 'phone' | 'address' | 'pincode', label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="fld">{label}<input id={`co-${k}`} value={c[k]} onChange={e => setC(x => ({ ...x, [k]: k === 'pincode' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value }))} {...props} /></label>)
  return (
    <>
      <div className="cart-back" onClick={close} />
      <aside className="cart" id="cart" role="dialog" aria-modal="true" aria-labelledby="cart-title" ref={panel} tabIndex={-1}>
        <header><h2 id="cart-title">{step === 'done' ? 'Order placed' : step === 'details' ? 'Delivery & payment' : `Your cart${lines.length ? ` (${count(lines)})` : ''}`}</h2>
          <button type="button" className="x" id="cart-close" aria-label="Close cart" onClick={close}>×</button></header>
        <div className="cart-body">
          {step === 'done' && done ? (
            <div className="done" id="order-done">
              <p>Thank you! Your order reference is <b className="ref">{done.ref}</b>.</p>
              <p>{done.saved ? 'We have received your order.' : 'Your order is ready on WhatsApp.'} If WhatsApp did not open, tap below and press send, and we will confirm your order and delivery date.</p>
              <a className="btn primary" href={done.wa} target="_blank" rel="noopener">{WA_ICON}Send order on WhatsApp</a>
              <button type="button" className="btn ghost" onClick={close}>Continue shopping</button>
            </div>
          ) : !lines.length ? <p className="empty">Your cart is empty.</p> : step === 'cart' ? (
            <>
              <ul className="lines">
                {lines.map(l => (
                  <li key={l.key} data-key={l.key}>
                    {l.img && <img src={l.img} alt="" width={56} height={72} />}
                    <span className="li-meta"><b>{l.name}</b><small>Size {l.size} · {inr.format(l.price)}</small>
                      <span className="qty small"><button type="button" aria-label={`Fewer ${l.name}`} onClick={() => cart.setQty(l.key, l.qty - 1)}>−</button><output>{l.qty}</output><button type="button" aria-label={`More ${l.name}`} onClick={() => cart.setQty(l.key, l.qty + 1)}>+</button>
                        <button type="button" className="rm" onClick={() => cart.remove(l.key)}>Remove</button></span></span>
                    <span className="li-sum">{inr.format(l.price * l.qty)}</span>
                  </li>
                ))}
              </ul>
              <PinCheck id="cart-pin" onResult={d => { setDel(d); if (d) setC(x => ({ ...x, pincode: d.pin })) }} />
            </>
          ) : (
            <form id="checkout" onSubmit={e => { e.preventDefault(); place() }} noValidate>
              {field('name', 'Full name', { autoComplete: 'name' })}
              {field('phone', 'Mobile number (WhatsApp)', { autoComplete: 'tel', inputMode: 'tel', placeholder: '98XXXXXXXX' })}
              <label className="fld">Delivery address<textarea id="co-address" rows={3} autoComplete="street-address" value={c.address} onChange={e => setC(x => ({ ...x, address: e.target.value }))} /></label>
              {field('pincode', 'Pincode', { autoComplete: 'postal-code', inputMode: 'numeric' })}
              {del && <p className="pin-out ok">Delivery to {[del.place, del.state].filter(Boolean).join(', ')} in <b>{days(del)}</b>.</p>}
              <fieldset className="pay"><legend>Payment</legend>
                <label><input type="radio" name="pay" checked={pay === 'cod'} onChange={() => setPay('cod')} /> Cash on delivery</label>
                {upi && <label><input type="radio" name="pay" checked={pay === 'upi'} onChange={() => setPay('upi')} /> Pay by UPI now</label>}
                <label><input type="radio" name="pay" checked={pay === 'whatsapp'} onChange={() => setPay('whatsapp')} /> Order on WhatsApp, pay later</label>
              </fieldset>
              {pay === 'upi' && upi && (
                <div className="upi">
                  <p>Pay <b>{inr.format(sum)}</b> to <b className="mono">{CONTACT.upiId}</b>, then enter the UPI reference (UTR).</p>
                  <a className="btn ghost" href={upiLink(sum, 'pending')} id="upi-open">Open UPI app</a>
                  <label className="fld">UPI reference (UTR)<input id="co-utr" value={utr} maxLength={30} onChange={e => setUtr(e.target.value.replace(/[^A-Za-z0-9]/g, ''))} /></label>
                </div>
              )}
              {err && <p className="pin-out bad" role="alert">{err}</p>}
            </form>
          )}
        </div>
        {step !== 'done' && lines.length > 0 && (
          <footer>
            <p className="sum"><span>Total</span><b>{inr.format(sum)}</b></p>
            {step === 'cart'
              ? <button type="button" className="btn primary" id="checkout-go" onClick={() => setStep('details')}>Checkout</button>
              : <><button type="submit" form="checkout" className="btn primary" id="place-order" disabled={busy}>{busy ? 'Placing…' : pay === 'cod' ? 'Place order (pay on delivery)' : pay === 'upi' ? 'Confirm payment & place order' : 'Place order on WhatsApp'}</button>
                <button type="button" className="link" onClick={() => setStep('cart')}>Back to cart</button></>}
          </footer>
        )}
      </aside>
    </>
  )
}
