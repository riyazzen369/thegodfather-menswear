/* Delivery estimate for any Indian pincode. Dispatch is from Bengaluru; we promise 1 to 7 days all over India.
   The pincode is validated with the public India Post lookup (api.postalpincode.in); if that is unreachable
   we still give an estimate from the first digits of the pincode. */
export type Delivery = { pin: string; place: string; state: string; min: number; max: number; looked: boolean }

const ZONES: [RegExp, number, number][] = [
  [/^karnataka$/i, 1, 2],
  [/^(tamil nadu|kerala|andhra pradesh|telangana|puducherry|pondicherry|lakshadweep)$/i, 2, 3],
  [/^(maharashtra|goa|gujarat|madhya pradesh|chhattisgarh|odisha|orissa|dadra and nagar haveli|daman and diu|dadra & nagar haveli)/i, 3, 5],
  [/^(delhi|haryana|punjab|chandigarh|rajasthan|uttar pradesh|uttarakhand|uttaranchal|himachal pradesh|bihar|jharkhand|west bengal)$/i, 4, 6],
  [/./, 5, 7]   // north-east, J&K, Ladakh, Andaman & Nicobar and anything else
]
export const estimate = (state: string): [number, number] => { for (const [re, a, b] of ZONES) if (re.test(state.trim())) return [a, b]; return [5, 7] }

/* first digit of a pincode -> postal circle, used only when the lookup is offline */
const BY_DIGIT: Record<string, [string, number, number]> = {
  '1': ['North India', 4, 6], '2': ['North India', 4, 6], '3': ['West India', 3, 5], '4': ['West India', 3, 5],
  '5': ['South India', 1, 3], '6': ['South India', 2, 3], '7': ['East and North-East India', 4, 7], '8': ['East India', 4, 6], '9': ['Army / special post', 5, 7]
}
export const validPin = (s: string) => /^[1-9][0-9]{5}$/.test(s)

export async function checkPin(pin: string, signal?: AbortSignal): Promise<Delivery | null> {
  if (!validPin(pin)) return null
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000)
    signal?.addEventListener('abort', () => ctl.abort())
    const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: ctl.signal }).finally(() => clearTimeout(t))
    const j = await r.json() as { Status?: string; PostOffice?: { District?: string; State?: string; Name?: string }[] }[]
    const po = j?.[0]?.PostOffice?.[0]
    if (j?.[0]?.Status === 'Success' && po?.State) { const [min, max] = estimate(po.State); return { pin, place: po.District || po.Name || '', state: po.State, min, max, looked: true } }
    if (j?.[0]?.Status === 'Error') return null            // the post office says this pincode does not exist
  } catch { /* offline or blocked: fall through to the estimate */ }
  const [place, min, max] = BY_DIGIT[pin[0]]
  return { pin, place, state: '', min, max, looked: false }
}
export const days = (d: Pick<Delivery, 'min' | 'max'>) => d.min === d.max ? `${d.min} day${d.min > 1 ? 's' : ''}` : `${d.min}–${d.max} days`
