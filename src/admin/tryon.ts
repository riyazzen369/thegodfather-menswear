/* Default model photos (kept in storage, shared by every product) and the "dress the model" call to the tryon edge function. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { publicUrl } from '../supa'

export type View = 'front' | 'back'
export const modelPath = (v: View) => `_model/${v}.jpg`
export const modelUrl = (v: View, bust?: string | number) => publicUrl(modelPath(v), bust ? String(bust) : undefined)!

/* downscale to at most `max` px on the long side, JPEG */
export async function shrink(file: Blob, max = 1500, q = .92): Promise<Blob> {
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k)
  const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height)
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Could not prepare the photo')), 'image/jpeg', q))
}
export const toDataUri = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(b) })

export async function hasModel(v: View): Promise<boolean> {
  try { return (await fetch(modelUrl(v, Date.now()), { method: 'HEAD', cache: 'no-store' })).ok } catch { return false }
}
export async function saveModel(sb: SupabaseClient, v: View, file: File) {
  const { error } = await sb.storage.from('products').upload(modelPath(v), await shrink(file), { contentType: 'image/jpeg', cacheControl: '60', upsert: true })
  if (error) throw error
}
/* returns the picture of the model wearing the garment */
export async function dress(sb: SupabaseClient, view: View, garment: Blob, plain: boolean): Promise<File> {
  const { data, error } = await sb.functions.invoke('tryon', { body: { model: modelUrl(view, Date.now()), garment: await toDataUri(await shrink(garment, 1400, .9)), view, plain } })
  if (error) {
    let msg = error.message
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error } catch { /* keep the generic message */ }
    throw new Error(msg)
  }
  if (!(data instanceof Blob)) throw new Error((data as { error?: string })?.error || 'The try-on service returned no picture.')
  return new File([data], `model-${view}.png`, { type: 'image/png' })
}
