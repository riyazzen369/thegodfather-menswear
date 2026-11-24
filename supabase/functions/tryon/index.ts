// Dress the default model in an uploaded garment (FASHN Try-On Max) and return the picture.
// Called only by the admin page (signed-in catalogue admins; verify_jwt is on). The FASHN key lives in the function secret FASHN_API_KEY.
// Body: { model: <public URL of the model photo>, garment: <data URI>, view: 'front' | 'back', plain?: boolean }
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'content-type': 'application/json' } })
const DAILY = Number(Deno.env.get('TRYON_DAILY_LIMIT') ?? '40')
const PLAIN = 'Show the garment as a plain back: same colour, fabric and fit, with no graphics, prints, logos, lettering or patterns.'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const key = Deno.env.get('FASHN_API_KEY')
  if (!key) return json({ error: 'The try-on service is not set up yet (missing FASHN_API_KEY).' }, 503)

  const url = Deno.env.get('SUPABASE_URL')!, svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '')
  const { data: u } = await svc.auth.getUser(jwt)
  if (!u?.user) return json({ error: 'Please sign in again.' }, 401)
  const { data: adm } = await svc.from('admins').select('user_id').eq('user_id', u.user.id).maybeSingle()
  if (!adm) return json({ error: 'Only catalogue admins can use this.' }, 403)

  let b: { model?: string; garment?: string; view?: string; plain?: boolean }
  try { b = await req.json() } catch { return json({ error: 'Bad request.' }, 400) }
  if (!b.model || !/^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/products\/_model\//.test(b.model)) return json({ error: 'Upload the default model photo first (Model tab).' }, 400)
  if (!b.garment || !/^data:image\/(jpeg|png|webp);base64,/.test(b.garment) || b.garment.length > 8_000_000) return json({ error: 'Garment photo is missing or too large.' }, 400)
  const view = b.view === 'back' ? 'back' : 'front'

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count } = await svc.from('tryon_log').select('id', { count: 'exact', head: true }).gte('created_at', since)
  if ((count ?? 0) >= DAILY) return json({ error: `Daily try-on limit reached (${DAILY}). Try again tomorrow.` }, 429)

  const auth = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const run = await fetch('https://api.fashn.ai/v1/run', { method: 'POST', headers: auth, body: JSON.stringify({
    model_name: 'tryon-max',
    inputs: { model_image: b.model, product_image: b.garment, prompt: b.plain ? PLAIN : '', resolution: '1k', generation_mode: 'balanced', num_images: 1, output_format: 'png' }
  }) })
  const started = await run.json().catch(() => ({}))
  if (!run.ok || !started.id) return json({ error: `Try-on service refused the request${started?.error?.message ? ': ' + started.error.message : '.'}` }, 502)
  await svc.from('tryon_log').insert({ user_id: u.user.id, view })

  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const st = await (await fetch(`https://api.fashn.ai/v1/status/${started.id}`, { headers: auth })).json().catch(() => ({}))
    if (st.status === 'completed' && st.output?.[0]) {
      const img = await fetch(st.output[0])
      if (!img.ok) return json({ error: 'Could not fetch the finished picture.' }, 502)
      return new Response(img.body, { headers: { ...cors, 'content-type': 'image/png' } })
    }
    if (st.status === 'failed') return json({ error: `Try-on failed${st.error?.message ? ': ' + st.error.message : '.'}` }, 502)
  }
  return json({ error: 'The try-on took too long. Please try again.' }, 504)
})
