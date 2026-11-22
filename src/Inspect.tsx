import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Item } from './data'

/* Inspect a piece: the photo stays whole. It sits on a gently curved card on a gold turntable (no displacement, so it
   never tears), turns within about ±35° with a spring (rubber-banding past that) and eases back to the front when let go.
   Lighting on the curve, a little tilt and the plinth's shadow give the 3D feel; the back face is the same silhouette,
   mirrored and darkened, so even an extreme angle shows a clean card edge, never torn geometry. */
export const cutOf = (src: string) => src.replace(/\/img\/([^/]+)\.webp$/, '/img/cut/$1.webp')
export const YAW_MAX = 35 * Math.PI / 180
/* shared turn state: the stage's pointer handlers write the target, the card springs toward it */
type Turn = { yaw: number; pitch: number; vy: number; vp: number; ty: number; tp: number; drag: boolean; force: number | null }
function cardGeo(aspect: number) {
  const H = 2.0, W = H * aspect, SEG = 40, BOW = 0.09
  const g = new THREE.PlaneGeometry(W, H, SEG, 1)
  const pos = g.attributes.position as THREE.BufferAttribute
  /* a shallow arc across the width (like a garment on a form): z = BOW * (1 - (2x/W)^2) */
  for (let i = 0; i < pos.count; i++) { const u = (2 * pos.getX(i)) / W; pos.setZ(i, BOW * (1 - u * u)) }
  g.computeVertexNormals()
  return { geo: g, H }
}

function Garment({ src, onReady, turn }: { src: string; onReady: () => void; turn: { current: Turn } }) {
  const grp = useRef<THREE.Group>(null)
  const [card, setCard] = useState<null | { geo: THREE.BufferGeometry; H: number; tex: THREE.Texture }>(null)
  useEffect(() => {
    let off = false
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = src
    img.decode().then(() => {
      if (off) return
      const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true
      setCard({ ...cardGeo(img.naturalWidth / img.naturalHeight), tex }); onReady()
    }).catch(() => onReady())
    return () => { off = true }
  }, [src, onReady])
  const mats = useMemo(() => card && ({
    front: new THREE.MeshStandardMaterial({ map: card.tex, alphaTest: 0.5, roughness: 0.7, metalness: 0.04, side: THREE.FrontSide }),
    back: new THREE.MeshStandardMaterial({ map: card.tex, alphaTest: 0.5, roughness: 0.9, metalness: 0, color: new THREE.Color(0.16, 0.12, 0.1), side: THREE.BackSide })
  }), [card])
  useEffect(() => () => { mats?.front.dispose(); mats?.back.dispose(); card?.geo.dispose(); card?.tex.dispose() }, [mats, card])
  const born = useRef(performance.now())
  useFrame((_, dtRaw) => {
    const g = grp.current; if (!g) return
    const T = turn.current, dt = Math.min(dtRaw, 0.1), now = performance.now()
    const k = Math.min(1, (now - born.current) / 700), e = 1 - Math.pow(1 - k, 3)
    g.scale.setScalar(0.86 + 0.14 * e); g.position.y = -0.04 * (1 - e)
    if (T.force != null) { T.yaw = T.force; T.vy = 0; T.pitch = 0 }
    else {
      /* released: spring home, with a slow idle sway so it never looks frozen */
      const idle = T.drag ? 0 : Math.sin(now / 1000 * 0.7) * 0.12 * e
      const ty = T.drag ? T.ty : idle, tp = T.drag ? T.tp : 0
      const w = T.drag ? 18 : 6
      for (let h = dt; h > 0; h -= 1 / 120) {
        const s = Math.min(h, 1 / 120)
        T.vy += (-2 * w * T.vy - w * w * (T.yaw - ty)) * s; T.yaw += T.vy * s
        T.vp += (-2 * w * T.vp - w * w * (T.pitch - tp)) * s; T.pitch += T.vp * s
      }
    }
    g.rotation.set(T.pitch, T.yaw, 0)
  })
  if (!card || !mats) return null
  return (
    <group ref={grp}>
      <mesh geometry={card.geo} material={mats.front} position={[0, card.H / 2 + 0.07, 0]} />
      <mesh geometry={card.geo} material={mats.back} position={[0, card.H / 2 + 0.07, 0]} />
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
  const turn = useRef<Turn>({ yaw: 0, pitch: 0, vy: 0, vp: 0, ty: 0, tp: 0, drag: false, force: null })
  const grab = useRef<null | { id: number; x: number; y: number; n: number }>(null)
  /* one-finger / mouse drag turns the card; a second finger (pinch) is left to the zoom */
  const tdown = (e: React.PointerEvent) => {
    if (!threeD) return
    if (grab.current) { grab.current.n++; turn.current.drag = false; return }
    grab.current = { id: e.pointerId, x: e.clientX, y: e.clientY, n: 1 }; turn.current.drag = true
  }
  const tmove = (e: React.PointerEvent) => {
    const g = grab.current; if (!g || g.id !== e.pointerId || g.n > 1) return
    const raw = ((e.clientX - g.x) / Math.max(320, window.innerWidth * 0.5)) * 1.6
    /* within ±35° it follows the finger; past it, it rubber-bands (never more than ~50°) */
    const a = Math.abs(raw), soft = a <= YAW_MAX ? a : YAW_MAX + (1 - Math.exp(-(a - YAW_MAX) * 2)) * 0.26
    turn.current.ty = Math.sign(raw) * soft
    turn.current.tp = Math.max(-0.1, Math.min(0.1, ((e.clientY - g.y) / window.innerHeight) * 0.5))
  }
  /* releases are caught on the window: the canvas may capture the pointer, and a finger can leave the stage */
  useEffect(() => {
    const up = (e: PointerEvent) => { const g = grab.current; if (!g) return; if (e.pointerId === g.id || --g.n <= 0) { grab.current = null; turn.current.drag = false } }
    addEventListener('pointerup', up); addEventListener('pointercancel', up)
    return () => { removeEventListener('pointerup', up); removeEventListener('pointercancel', up) }
  }, [])
  useEffect(() => {
    /* test hook: hold an exact angle (degrees), or null to release */
    ;(window as any).__inspectYaw = (deg: number | null) => { turn.current.force = deg == null ? null : deg * Math.PI / 180 }
    ;(window as any).__inspectTurn = () => turn.current.yaw * 180 / Math.PI
    return () => { delete (window as any).__inspectYaw; delete (window as any).__inspectTurn }
  }, [])
  return (
    <div className={`inspect ${shown ? 'open' : ''} ${ready ? 'ready' : ''}`} role="dialog" aria-modal="true" aria-labelledby="inspect-title" id="inspect" onPointerMove={move}>
      <div className="inspect-stage" aria-hidden="true" onPointerDown={tdown} onPointerMove={tmove}>
        {threeD ? (
          <Canvas className="inspect-gl" dpr={[1, 1.75]} camera={{ fov: 34, position: [0, 1.2, portrait ? 4.6 : 4.1] }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
            <ambientLight intensity={0.35} />
            <hemisphereLight args={['#ffe2a8', '#2a1606', 0.55]} />
            <directionalLight position={[-2.2, 3.2, 3]} intensity={2.4} color="#ffd89a" />
            <directionalLight position={[2.6, 2.4, -2.8]} intensity={2.2} color="#ffb84d" />
            <pointLight position={[0, 0.4, 1.6]} intensity={1.2} color="#ffcf80" distance={5} />
            <Suspense fallback={null}><Garment src={cutOf(src)} onReady={onReady} turn={turn} /></Suspense>
            <Turntable />
            {/* zoom only (wheel, pinch); turning is the card's own clamped spring above */}
            <OrbitControls target={[0, portrait ? 0.98 : 1.08, 0]} enablePan={false} enableRotate={false} enableDamping dampingFactor={0.08}
              minDistance={2.4} maxDistance={5.2} zoomSpeed={0.6} />
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
