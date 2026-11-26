import { useEffect, useRef, useState } from 'react'
import { LQIP } from './lqip'
import { LOGO_GATE, LOGO_SET } from './data'

/* Responsive product picture: AVIF/WebP at 512w and full size (864w), a 12x16 blurred preview underneath,
   and a crossfade once the real image has decoded. Decoded URLs are remembered so revisits never flash. */
const seen = new Set<string>()
const parts = (src: string) => {
  const m = src.match(/^(.*\/)([^/]+)\.webp$/)
  if (!m) return null
  const [, dir, name] = m
  return { dir, name, small: !/-4$/.test(name) }   // -4 crops are already small
}
/* live photos: full URL -> its 512 px WebP copy (registered when the catalogue loads; rows without one keep the single image) */
export const REMOTE_SMALL = new Map<string, string>()
export const sources = (src: string) => {
  const sm = REMOTE_SMALL.get(src)
  if (sm) return { avif: '', webp: `${sm} 512w, ${src} 864w` }
  const p = parts(src)
  if (!p || !p.small) return { avif: '', webp: '' }
  return {
    avif: `${p.dir}r/${p.name}-512.avif 512w, ${p.dir}r/${p.name}-full.avif 864w`,
    webp: `${p.dir}r/${p.name}-512.webp 512w, ${src} 864w`
  }
}
/* placeholders for live-catalogue photos (absolute URLs), registered when the catalogue loads */
export const REMOTE_LQIP = new Map<string, string>()
export const lqip = (src: string) => { const p = parts(src); return (p ? LQIP[p.name] : undefined) ?? REMOTE_LQIP.get(src) }

/* warm the cache for a picture (same choice of source the <picture> would make) */
const avifOK = (() => { try { return document.createElement('canvas').toDataURL('image/avif').startsWith('data:image/avif') } catch { return false } })()
export function preloadPic(src: string, cssW: number) {
  const sm = REMOTE_SMALL.get(src)
  let url: string
  if (sm) {
    /* live photo: warm the exact file the <picture> will pick (512 px copy up to 512 device pixels wide, else the full one) */
    url = cssW * (devicePixelRatio || 1) <= 512 ? sm : src
  } else {
    const p = parts(src); if (!p) return
    const want = cssW * Math.min(2, devicePixelRatio || 1)
    const big = want > 560 || !p.small
    url = !p.small ? src : avifOK ? `${p.dir}r/${p.name}-${big ? 'full' : '512'}.avif` : big ? src : `${p.dir}r/${p.name}-512.webp`
  }
  if (seen.has(url)) return
  const i = new Image(); i.decoding = 'async'; i.src = url
  i.decode?.().then(() => seen.add(url)).catch(() => {})
}

/* the one file a 3D wardrobe texture should use (WebP, sized like the <picture> would pick) */
export function photoUrl(src: string, cssW: number) {
  const sm = REMOTE_SMALL.get(src)
  if (sm) return cssW * (devicePixelRatio || 1) <= 512 ? sm : src
  const p = parts(src); if (!p) return src
  const want = cssW * Math.min(2, devicePixelRatio || 1)
  return !p.small || want > 560 ? src : `${p.dir}r/${p.name}-512.webp`
}

export default function Pic({ src, alt, sizes, load = true, eager = false, lazy = false, className = '', imgClass = '' }: {
  src: string; alt: string; sizes: string; load?: boolean; eager?: boolean; lazy?: boolean; className?: string; imgClass?: string
}) {
  const img = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)
  const s = sources(src), lq = lqip(src)
  useEffect(() => {
    const el = img.current
    if (el && el.complete && el.naturalWidth) setLoaded(true)
  }, [load, src])
  /* show it only once decoded: no half-painted frame while sliding */
  const done = () => { const el = img.current; Promise.resolve(el?.decode?.()).catch(() => {}).then(() => { if (el?.currentSrc) seen.add(el.currentSrc); setLoaded(true) }) }
  return (
    <span className={`pic ${loaded ? 'loaded' : ''} ${className}`}>
      {lq && <span className="pic-lq" style={{ backgroundImage: `url(${lq})` }} aria-hidden="true" />}
      {load && (
        <picture>
          {s.avif && <source type="image/avif" srcSet={s.avif} sizes={sizes} />}
          {s.webp && <source type="image/webp" srcSet={s.webp} sizes={sizes} />}
          <img ref={img} className={imgClass} src={src} alt={alt} width={768} height={1024} decoding="async" draggable={false}
            loading={lazy ? 'lazy' : 'eager'} fetchPriority={eager ? 'high' : 'auto'} onLoad={done} onError={done} />
        </picture>
      )}
    </span>
  )
}

/* The logo, always crisp: the browser picks a 1x/2x/3x source; the glow is its own layer, never a filter on the mark */
export function Mark({ sizes, className = '', glow = 'soft' }: { sizes: string; className?: string; glow?: 'soft' | 'neon' }) {
  return (
    <span className={`mark ${glow} ${className}`}>
      {glow === 'neon'
        ? <img className="mark-glow" src={LOGO_GATE} srcSet={LOGO_SET} sizes={sizes} alt="" width={1550} height={1180} aria-hidden="true" />
        : <span className="mark-glow" aria-hidden="true" />}
      <img className="mark-img" src={LOGO_GATE} srcSet={LOGO_SET} sizes={sizes} alt="" width={1550} height={1180} />
    </span>
  )
}
