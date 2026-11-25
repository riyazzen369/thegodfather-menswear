/* Website transactions and finances, computed in the browser from the orders table (admins only, by RLS). */
import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Tx = { ref: string; created_at: string; name: string; phone: string; payment: 'upi' | 'cod' | 'whatsapp'; utr: string | null; total: number; status: string; paid: boolean; paid_at: string | null; delivery: string | null; items: { name: string; size: string; qty: number; price: number }[] }
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('en-IN')
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso))
const monthKey = (iso: string) => dayKey(iso).slice(0, 7)
const RANGES = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['all', 'All time']] as const
const PAY: Record<string, string> = { upi: 'UPI', cod: 'Cash on delivery', whatsapp: 'WhatsApp, pay later' }
const SIZES = ['S', 'M', 'L', 'XL', 'XXL']

export function summarise(all: Tx[]) {
  const live = all.filter(o => o.status !== 'cancelled'), cancelled = all.filter(o => o.status === 'cancelled')
  const sum = (l: Tx[]) => l.reduce((s, o) => s + o.total, 0)
  const gross = sum(live), collected = sum(live.filter(o => o.paid))
  const units = live.reduce((s, o) => s + o.items.reduce((u, i) => u + i.qty, 0), 0)
  return { orders: live.length, gross, collected, outstanding: gross - collected, aov: live.length ? Math.round(gross / live.length) : 0, units, cancelled: cancelled.length, cancelledValue: sum(cancelled) }
}

export default function Analytics({ sb }: { sb: SupabaseClient }) {
  const [rows, setRows] = useState<Tx[] | null>(null), [err, setErr] = useState(''), [range, setRange] = useState<string>('30'), [table, setTable] = useState(false)
  const load = async () => {
    const { data, error } = await sb.from('orders').select('ref,created_at,name,phone,payment,utr,total,status,paid,paid_at,delivery,items').order('created_at', { ascending: false }).limit(5000)
    if (error) setErr(error.message); else { setErr(''); setRows(data as Tx[]) }
  }
  useEffect(() => { load() }, [])
  const list = useMemo(() => {
    if (!rows) return []
    if (range === 'all') return rows
    const from = Date.now() - Number(range) * 864e5
    return rows.filter(o => new Date(o.created_at).getTime() >= from)
  }, [rows, range])
  const S = useMemo(() => summarise(list), [list])
  const live = useMemo(() => list.filter(o => o.status !== 'cancelled'), [list])

  /* sales over time: daily up to 90 days, monthly beyond */
  const series = useMemo(() => {
    const monthly = range === '365' || range === 'all', m = new Map<string, { v: number; n: number }>()
    if (!monthly) { const days = Number(range); for (let i = days - 1; i >= 0; i--) m.set(dayKey(new Date(Date.now() - i * 864e5).toISOString()), { v: 0, n: 0 }) }
    for (const o of live) { const k = monthly ? monthKey(o.created_at) : dayKey(o.created_at); const e = m.get(k) ?? { v: 0, n: 0 }; e.v += o.total; e.n++; m.set(k, e) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, e]) => ({ k, ...e }))
  }, [live, range])
  const byPay = useMemo(() => (['upi', 'cod', 'whatsapp'] as const).map(p => ({ k: p, label: PAY[p], v: live.filter(o => o.payment === p).reduce((s, o) => s + o.total, 0), n: live.filter(o => o.payment === p).length })), [live])
  const byStatus = useMemo(() => ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'].map(s => ({ k: s, label: s[0].toUpperCase() + s.slice(1), v: list.filter(o => o.status === s).length })), [list])
  const top = useMemo(() => {
    const m = new Map<string, { v: number; u: number }>()
    for (const o of live) for (const i of o.items) { const e = m.get(i.name) ?? { v: 0, u: 0 }; e.v += i.price * i.qty; e.u += i.qty; m.set(i.name, e) }
    return [...m.entries()].map(([k, e]) => ({ k, label: k, ...e })).sort((a, b) => b.v - a.v).slice(0, 8)
  }, [live])
  const bySize = useMemo(() => SIZES.map(z => ({ k: z, label: z, v: live.reduce((s, o) => s + o.items.filter(i => i.size === z).reduce((u, i) => u + i.qty, 0), 0) })), [live])

  const csv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Reference', 'Date (IST)', 'Customer', 'Phone', 'Payment', 'UTR', 'Amount', 'Status', 'Paid', 'Paid on', 'Items']
    const lines = list.map(o => [o.ref, new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), o.name, o.phone, PAY[o.payment], o.utr ?? '', o.total, o.status, o.paid ? 'yes' : 'no', o.paid_at ? new Date(o.paid_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '', o.items.map(i => `${i.name} ${i.size} x${i.qty}`).join('; ')].map(esc).join(','))
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' }))
    a.download = `godfather-transactions-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <section id="adm-analytics" className="viz">
      <div className="adm-bar">
        <h1>Sales &amp; payments</h1>
        <span className="viz-tools">
          <label className="visually">Date range</label>
          <select id="an-range" aria-label="Date range" value={range} onChange={e => setRange(e.target.value)}>{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button type="button" className="ghost" onClick={load}>Refresh</button>
          <button type="button" className="ghost" id="an-csv" onClick={csv} disabled={!list.length}>Download CSV</button>
        </span>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {!rows ? <p className="note">Loading…</p> : (
        <>
          <div className="kpis" id="an-kpis">
            <Kpi label="Sales" value={inr.format(S.gross)} sub={`${num.format(S.orders)} order${S.orders === 1 ? '' : 's'}, cancelled excluded`} id="k-gross" />
            <Kpi label="Money received" value={inr.format(S.collected)} sub="orders marked paid" id="k-collected" />
            <Kpi label="Still to receive" value={inr.format(S.outstanding)} sub="not yet marked paid" id="k-out" />
            <Kpi label="Average order" value={inr.format(S.aov)} sub={`${num.format(S.units)} piece${S.units === 1 ? '' : 's'} sold`} id="k-aov" />
            <Kpi label="Cancelled" value={num.format(S.cancelled)} sub={inr.format(S.cancelledValue)} id="k-cancel" />
          </div>
          {!list.length ? <p className="note" id="an-empty">No orders in this period yet.</p> : (
            <>
              <Panel title={range === '365' || range === 'all' ? 'Sales by month' : 'Sales by day'} table={table} onTable={setTable} rows={series.map(s => [s.k, inr.format(s.v), String(s.n)])} cols={['Period', 'Sales', 'Orders']}>
                <Columns data={series} />
              </Panel>
              <div className="viz-grid">
                <Panel title="How customers pay" rows={byPay.map(p => [p.label, inr.format(p.v), String(p.n)])} cols={['Method', 'Sales', 'Orders']}>
                  <Bars data={byPay.map((p, i) => ({ k: p.k, label: p.label, v: p.v, color: `var(--series-${i + 1})`, note: `${p.n} order${p.n === 1 ? '' : 's'}` }))} money legend />
                </Panel>
                <Panel title="Orders by status" rows={byStatus.map(s => [s.label, String(s.v)])} cols={['Status', 'Orders']}>
                  <Bars data={byStatus.map(s => ({ ...s, color: 'var(--series-1)' }))} />
                </Panel>
                <Panel title="Best sellers" rows={top.map(t => [t.label, inr.format(t.v), String(t.u)])} cols={['Piece', 'Sales', 'Units']}>
                  <Bars data={top.map(t => ({ k: t.k, label: t.label, v: t.v, color: 'var(--series-1)', note: `${t.u} sold` }))} money />
                </Panel>
                <Panel title="Sizes sold" rows={bySize.map(s => [s.label, String(s.v)])} cols={['Size', 'Pieces']}>
                  <Bars data={bySize.map(s => ({ ...s, color: 'var(--series-1)' }))} />
                </Panel>
              </div>
              <h2 className="viz-h">Transactions</h2>
              <div className="tx-wrap"><table className="tx" id="an-tx">
                <thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Payment</th><th className="r">Amount</th><th>Status</th><th>Paid</th></tr></thead>
                <tbody>{list.slice(0, 100).map(o => (
                  <tr key={o.ref}><td>{new Date(o.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}</td><td className="mono">{o.ref}</td><td>{o.name}</td>
                    <td>{PAY[o.payment]}{o.utr ? <small className="mono"> {o.utr}</small> : null}</td><td className="r">{inr.format(o.total)}</td><td>{o.status}</td><td>{o.paid ? 'Yes' : 'No'}</td></tr>))}</tbody>
              </table></div>
              {list.length > 100 && <p className="note">Showing the latest 100 of {list.length}. The CSV has all of them.</p>}
            </>
          )}
        </>
      )}
    </section>
  )
}

function Kpi({ label, value, sub, id }: { label: string; value: string; sub: string; id: string }) {
  return <div className="kpi" id={id}><span className="kpi-l">{label}</span><b className="kpi-v">{value}</b><span className="kpi-s">{sub}</span></div>
}
function Panel({ title, children, rows, cols, table, onTable }: { title: string; children: React.ReactNode; rows: string[][]; cols: string[]; table?: boolean; onTable?: (v: boolean) => void }) {
  const [own, setOwn] = useState(false), showTable = table ?? own, toggle = onTable ?? setOwn
  return (
    <div className="panel">
      <div className="panel-h"><h2>{title}</h2><button type="button" className="ghost small" aria-pressed={showTable} onClick={() => toggle(!showTable)}>{showTable ? 'Show chart' : 'Show table'}</button></div>
      {showTable ? <table className="tx"><thead><tr>{cols.map((c, i) => <th key={c} className={i ? 'r' : ''}>{c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? 'r' : ''}>{c}</td>)}</tr>)}</tbody></table> : children}
    </div>
  )
}

/* vertical columns over time: one series, so no legend; hover or focus a column for its value */
function Columns({ data }: { data: { k: string; v: number; n: number }[] }) {
  const [hot, setHot] = useState<number | null>(null)
  const W = 720, H = 200, L = 52, B = 26, T = 8, max = Math.max(1, ...data.map(d => d.v)), step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step
  const bw = (W - L) / data.length, gap = Math.min(2, bw * 0.15), w = Math.max(1, bw - gap)
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const ticks = [0, 0.5, 1].map(f => f * top)
  const labelEvery = Math.ceil(data.length / 8)
  const h = hot !== null ? data[hot] : null
  return (
    <figure className="chart" aria-label="Sales over time">
      <div className="tip" aria-live="polite">{h ? <><b>{h.k}</b> · {inr.format(h.v)} · {h.n} order{h.n === 1 ? '' : 's'}</> : <span className="note">Hover a column for its value</span>}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Column chart of sales over time" onPointerLeave={() => setHot(null)}>
        {ticks.map((t, i) => <g key={i}><line x1={L} x2={W} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 6} y={y(t) + 4} textAnchor="end" className="ax">{t >= 1e5 ? `${+(t / 1e5).toFixed(1)}L` : t >= 1e3 ? `${+(t / 1e3).toFixed(1)}k` : t}</text></g>)}
        {data.map((d, i) => {
          const x = L + i * bw + gap / 2, bh = Math.max(d.v > 0 ? 2 : 0, y(0) - y(d.v)), r = Math.min(4, w / 2, bh)
          return (
            <g key={d.k} onPointerEnter={() => setHot(i)} onFocus={() => setHot(i)} tabIndex={0} role="img" aria-label={`${d.k}: ${inr.format(d.v)}, ${d.n} orders`}>
              <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
              {d.v > 0 && <path d={`M${x},${y(0)} V${y(0) - bh + r} Q${x},${y(0) - bh} ${x + r},${y(0) - bh} H${x + w - r} Q${x + w},${y(0) - bh} ${x + w},${y(0) - bh + r} V${y(0)} Z`} className={`col ${hot === i ? 'hot' : ''}`} />}
              {i % labelEvery === 0 && <text x={x + w / 2} y={H - 8} textAnchor="middle" className="ax">{d.k.length > 7 ? d.k.slice(5) : d.k}</text>}
            </g>)
        })}
      </svg>
    </figure>
  )
}

/* horizontal bars with direct value labels */
function Bars({ data, money, legend }: { data: { k: string; label: string; v: number; color: string; note?: string }[]; money?: boolean; legend?: boolean }) {
  const max = Math.max(1, ...data.map(d => d.v))
  return (
    <div className="bars">
      {legend && <div className="legend" aria-hidden="false">{data.map(d => <span key={d.k}><i style={{ background: d.color }} />{d.label}</span>)}</div>}
      {data.map(d => (
        <div className="bar-row" key={d.k} title={`${d.label}: ${money ? inr.format(d.v) : num.format(d.v)}${d.note ? ' · ' + d.note : ''}`}>
          <span className="bar-l">{d.label}</span>
          <span className="bar-t"><span className="bar-f" style={{ width: `${Math.max(d.v > 0 ? 2 : 0, d.v / max * 100)}%`, background: d.color }} /></span>
          <span className="bar-v">{money ? inr.format(d.v) : num.format(d.v)}{d.note && <small> · {d.note}</small>}</span>
        </div>))}
    </div>
  )
}
