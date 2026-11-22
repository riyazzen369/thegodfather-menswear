import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Item } from './data'

/* Inspect a piece: the photo becomes a 2.5D garment on a gold turntable that turns slowly and can be turned by hand.
   The cut-out (background removed offline, public/img/cut) gives the silhouette; a distance-to-edge profile gives it body,
   a little luminance relief gives it folds, and a darker back closes it, so it reads as an object from any side. */
export const cutOf = (src: string) => src.replace(/\/img\/([^/]+)\.webp$/, '/img/cut/$1.webp')
const GX = 72, GY = 96

function garmentGeo(img: HTMLImageElement) {
  const c = document.createElement('canvas'); c.width = GX; c.height = GY
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, GX, GY)
  const px = g.getImageData(0, 0, GX, GY).data
  const inside = new Float32Array(GX * GY), lum = new Float32Array(GX * GY)
  for (let i = 0; i < GX * GY; i++) { inside[i] = px[i * 4 + 3] > 110 ? 1 : 0; lum[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255 }
  /* chamfer distance to the silhouette edge, in cells */
  const d = new Float32Array(GX * GY); const BIG = 1e4
  for (let i = 0; i < GX * GY; i++) d[i] = inside[i] ? BIG : 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= GX || y >= GY) ? 0 : d[y * GX + x]
  for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) { const i = y * GX + x; if (!d[i]) continue; d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.41, at(x + 1, y - 1) + 1.41) }
  for (let y = GY - 1; y >= 0; y--) for (let x = GX - 1; x >= 0; x--) { const i = y * GX + x; if (!d[i]) continue; d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.41, at(x - 1, y + 1) + 1.41) }
  const W = 1.5, H = 2.0, R = 11, DEPTH = 0.26
  const front = new THREE.PlaneGeometry(W, H, GX - 1, GY - 1)
  const pos = front.attributes.position as THREE.BufferAttribute
  const z = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const gx = i % GX, gy = Math.floor(i / GX), k = gy * GX + gx
    const t = Math.min(1, d[k] / R), body = 1 - (1 - t) * (1 - t)           // rounded towards the edges
    z[i] = inside[k] ? DEPTH * body + 0.03 * (lum[k] - 0.4) * t : 0
  }
  /* soften the relief once so folds aren't noisy */
  const zs = z.slice()
  for (let y = 1; y < GY - 1; y++) for (let x = 1; x < GX - 1; x++) { const i = y * GX + x; zs[i] = (z[i] * 4 + z[i - 1] + z[i + 1] + z[i - GX] + z[i + GX]) / 8 }
  for (let i = 0; i < pos.count; i++) pos.setZ(i, zs[i])
  front.computeVertexNormals()
  const back = front.clone(); const bp = back.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < bp.count; i++) bp.setZ(i, -zs[i] * 0.75)
  back.computeVertexNormals()
  return { front, back, H }
}

function Garment({ src, onReady }: { src: string; onReady: () => void }) {
  const grp = useRef<THREE.Group>(null)
  const [geo, setGeo] = useState<null | { front: THREE.BufferGeometry; back: THREE.BufferGeometry; H: number; tex: THREE.Texture }>(null)
  useEffect(() => {
    let off = false
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = src
    img.decode().then(() => {
      if (off) return
      const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true
      setGeo({ ...garmentGeo(img), tex }); onReady()
    }).catch(() => onReady())
    return () => { off = true }
  }, [src, onReady])
  const mats = useMemo(() => geo && ({
    front: new THREE.MeshStandardMaterial({ map: geo.tex, alphaTest: 0.5, roughness: 0.72, metalness: 0.04 }),
    back: new THREE.MeshStandardMaterial({ map: geo.tex, alphaTest: 0.5, roughness: 0.8, metalness: 0.02, color: new THREE.Color(0.42, 0.36, 0.32), side: THREE.BackSide })
  }), [geo])
  const born = useRef(performance.now())
  useFrame(() => {
    const g = grp.current; if (!g) return
    const k = Math.min(1, (performance.now() - born.current) / 700), e = 1 - Math.pow(1 - k, 3)
    g.scale.setScalar(0.86 + 0.14 * e); g.position.y = -0.04 * (1 - e)
  })
  if (!geo || !mats) return null
  return (
    <group ref={grp}>
      <mesh geometry={geo.front} material={mats.front} position={[0, geo.H / 2 + 0.06, 0]} />
      <mesh geometry={geo.back} material={mats.back} position={[0, geo.H / 2 + 0.06, 0]} />
    </group>
  )
}

function Turntable() {
  const shadow = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128
    const g = c.getContext('2d')!; const r = g.createRadialGradient(64, 64, 4, 64, 64, 64)
    r.addColorStop(0, 'rgba(0,0,0,.7)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  }, [])
  return (
    <group>
      <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.95, 1.0, 0.06, 64]} /><meshStandardMaterial color="#8a6a2c" metalness={0.85} roughness={0.32} /></mesh>
      <mesh position={[0, 0.062, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.86, 0.9, 64]} /><meshBasicMaterial color={new THREE.Color(2.2, 1.6, 0.7)} toneMapped={false} /></mesh>
      <mesh position={[0, 0.063, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.5, 0.9]} /><meshBasicMaterial map={shadow} transparent depthWrite={false} /></mesh>
      
    </group>
  )
}

export default function Inspect({ item, threeD, onClose, onDetails, enquireHref, price }: {
  item: Item; threeD: boolean; onClose: () => void; onDetails: () => void; enquireHref: string; price: string | null
}) {
  const [shown, setShown] = useState(false)
  const [ready, setReady] = useState(!threeD)
  const close = useRef<HTMLButtonElement>(null)
  const tilt = useRef<HTMLDivElement>(null)
  useEffect(() => { const id = requestAnimationFrame(() => { setShown(true); close.current?.focus({ preventScroll: true }) }); return () => cancelAnimationFrame(id) }, [])
  const src = item.images[0].src
  const onReady = useMemo(() => () => setReady(true), [])
  /* the fallback (reduced motion / no WebGL): the picture tilts a little toward the pointer */
  const move = (e: React.PointerEvent) => {
    const el = tilt.current; if (!el || threeD) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--tx', (((e.clientX - r.left) / r.width) - 0.5).toFixed(3)); el.style.setProperty('--ty', (((e.clientY - r.top) / r.height) - 0.5).toFixed(3))
  }
  const portrait = typeof window !== 'undefined' && window.innerWidth < window.innerHeight
  return (
    <div className={`inspect ${shown ? 'open' : ''} ${ready ? 'ready' : ''}`} role="dialog" aria-modal="true" aria-labelledby="inspect-title" id="inspect" onPointerMove={move}>
      <div className="inspect-stage" aria-hidden="true">
        {threeD ? (
          <Canvas className="inspect-gl" dpr={[1, 1.75]} camera={{ fov: 34, position: [0, 1.2, portrait ? 4.6 : 4.1] }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
            <ambientLight intensity={0.35} />
            <hemisphereLight args={['#ffe2a8', '#2a1606', 0.55]} />
            <directionalLight position={[-2.2, 3.2, 3]} intensity={2.4} color="#ffd89a" />
            <directionalLight position={[2.6, 2.4, -2.8]} intensity={2.2} color="#ffb84d" />
            <pointLight position={[0, 0.4, 1.6]} intensity={1.2} color="#ffcf80" distance={5} />
            <Suspense fallback={null}><Garment src={cutOf(src)} onReady={onReady} /></Suspense>
            <Turntable />
            <OrbitControls target={[0, portrait ? 0.98 : 1.08, 0]} enablePan={false} enableDamping dampingFactor={0.08} autoRotate autoRotateSpeed={1.4}
              minPolarAngle={Math.PI / 2 - 0.32} maxPolarAngle={Math.PI / 2 + 0.06} minDistance={2.4} maxDistance={5.2} rotateSpeed={0.7} zoomSpeed={0.6} />
          </Canvas>
        ) : (
          <div className="inspect-flat" ref={tilt}><img src={cutOf(src)} alt="" decoding="async" /></div>
        )}
      </div>
      <aside className="inspect-panel">
        <p className="inspect-kicker">Private wardrobe · inspect</p>
        <h2 id="inspect-title">{item.name}</h2>
        <p className="inspect-tag">{item.tagline}</p>
        {price && <p className="inspect-price">{price}</p>}
        <div className="inspect-actions">
          <a className="btn primary" href={enquireHref} target="_blank" rel="noopener" id="inspect-wa">Enquire on WhatsApp</a>
          <button type="button" className="btn ghost" id="inspect-details" onClick={onDetails}>Full details</button>
        </div>
        {threeD && <p className="inspect-hint">Drag to turn · pinch or scroll to look closer</p>}
      </aside>
      <button type="button" className="inspect-close" id="inspect-close" ref={close} onClick={onClose} aria-label="Close and return to the wardrobe">×</button>
    </div>
  )
}
