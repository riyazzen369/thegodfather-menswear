/* Client-side image prep for uploads: decode, scale to fit 1600px, encode WebP, plus a 12x16 blurred placeholder. */
export async function prepare(file: File, max = 1600): Promise<{ blob: Blob; blur: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h)
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/webp', 0.86))
  if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot encode WebP. Use Chrome, Edge or Firefox.')
  const s = document.createElement('canvas'); s.width = 12; s.height = 16
  const sg = s.getContext('2d')!
  /* cover-crop into 3:4 like the product frames */
  const r = 3 / 4, sw = bmp.width / bmp.height > r ? bmp.height * r : bmp.width, sh = sw / r
  sg.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, 12, 16)
  const blur = s.toDataURL('image/webp', 0.5)
  bmp.close()
  return { blob, blur, w, h }
}
