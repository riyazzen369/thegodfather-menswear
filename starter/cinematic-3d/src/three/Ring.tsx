/* One piece on the ring: a gold arch (the niche), the product photo as a plane in front of it, and a plinth ring.
   Every piece runs the SAME code with a different index. Read this file top to bottom to understand the whole look. */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { rig, ringAt, ringFade, smooth, clamp01 } from '../rig'
import { PIECES } from '../content'
import { world } from './world'

/* ---- the arch: a signed-distance shape drawn by a tiny shader, additive so it glows with bloom ---- */
function nicheMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uI: { value: 0 }, uAsp: { value: 0.75 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uI; uniform float uAsp; varying vec2 vUv;
      float sdArch(vec2 p, vec2 b){ float r = b.x; float top = b.y - r; if (p.y > top) return length(vec2(p.x, p.y - top)) - r; vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
      void main(){
        vec2 p = (vUv - 0.5) * vec2(uAsp, 1.0);
        float d = sdArch(p, vec2(uAsp * 0.44, 0.47));
        float line = exp(-abs(d) * 220.0) + exp(-abs(d + 0.018) * 420.0) * 0.5;
        float glow = exp(-max(d, 0.0) * 30.0) * 0.18 * step(0.0, d);
        float inner = (1.0 - smoothstep(-0.2, 0.0, d)) * 0.05;
        float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(0.0, 0.14, 1.0 - vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(0.0, 0.08, 1.0 - vUv.y);   // the plane's edge never shows
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.32) * (line * 1.6 + (glow + inner) * edge) * uI, 1.0); }`
  })
}

/* ---- soft feathered edges for the photo plane, as an alpha map (so a photo never ends in a hard rectangle) ---- */
let edgeTex: THREE.CanvasTexture | null = null
function edgeMask() {
  if (edgeTex) return edgeTex
  const c = document.createElement('canvas'); c.width = c.height = 64
  const x = c.getContext('2d')!, d = x.createImageData(64, 64), ss = (a: number, b: number, t: number) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u) }
  for (let j = 0; j < 64; j++) for (let k = 0; k < 64; k++) {
    const u = (k + 0.5) / 64, v = (j + 0.5) / 64, m = ss(0, 0.2, u) * ss(0, 0.2, 1 - u) * ss(0, 0.11, v) * ss(0, 0.11, 1 - v), o = (j * 64 + k) * 4
    d.data[o] = d.data[o + 1] = d.data[o + 2] = Math.round(m * 255); d.data[o + 3] = 255
  }
  x.putImageData(d, 0, 0); edgeTex = new THREE.CanvasTexture(c); return edgeTex
}

/* ---- auto-framing: find the subject in the cut-out's alpha and redraw it centred, sized to the arch, standing on the plinth.
   Opaque photos (no transparency) are left alone. This is why ANY cut-out can be dropped in without hand-tuning. ---- */
const FIT = { h: 0.80, bottom: 0.935, maxW: 0.72 }       // fractions of the photo plane (measured against the arch below)
function fitSubject(im: HTMLImageElement): HTMLCanvasElement | null {
  const PW = 96, PH = 128, pc = document.createElement('canvas'); pc.width = PW; pc.height = PH
  const px = pc.getContext('2d', { willReadFrequently: true }); if (!px) return null
  px.drawImage(im, 0, 0, PW, PH)
  const d = px.getImageData(0, 0, PW, PH).data
  let x0 = PW, x1 = -1, y0 = PH, y1 = -1, soft = 0
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) { const a = d[(y * PW + x) * 4 + 3]; if (a < 250) soft++; if (a > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y } }
  if (x1 < 0 || soft < PW * PH * 0.04) return null
  const bw = (x1 - x0 + 1) / PW, bh = (y1 - y0 + 1) / PH
  if (bw < 0.12 || bh < 0.12) return null
  const k = Math.max(0.5, Math.min(2.4, Math.min(FIT.h / bh, FIT.maxW / bw)))
  const W = Math.min(768, im.width), H = Math.round(W * 4 / 3), c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d'); if (!x) return null
  const cx = ((x0 + x1 + 1) / 2 / PW) * im.width, bottom = ((y1 + 1) / PH) * im.height, sc = k * (W / im.width)
  x.drawImage(im, 0, 0, im.width, im.height, W / 2 - cx * sc, FIT.bottom * H - bottom * sc, im.width * sc, im.height * sc)
  return c
}
const loader = (() => { const l = new THREE.TextureLoader(); l.setCrossOrigin('anonymous'); return l })()

export function Piece({ i }: { i: number }) {
  const g = useRef<THREE.Group>(null), photo = useRef<THREE.Mesh>(null), niche = useRef<THREE.Mesh>(null), plinth = useRef<THREE.Mesh>(null), ring = useRef<THREE.Mesh>(null)
  const nm = useMemo(() => nicheMat(), [])
  const pm = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, opacity: 0, alphaMap: edgeMask() }), [])
  const plm = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.07, 0.055, 0.045) }), [])
  const rm = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.3), toneMapped: false }), [])
  const gl = useThree(t => t.gl)
  const st = useRef({ a: 0, ready: false, k: 0, wake: 0 })
  useEffect(() => () => { pm.map?.dispose(); pm.dispose(); nm.dispose(); plm.dispose(); rm.dispose() }, [pm, nm, plm, rm])
  /* load this piece's photo a moment after the scene starts (nearest first), so the first frames never wait for pictures */
  useEffect(() => {
    const id = window.setTimeout(() => {
      loader.load(PIECES[i].image, tex => {
        let t: THREE.Texture = tex
        const im = tex.image as HTMLImageElement, c = im ? fitSubject(im) : null
        if (c) { tex.dispose(); t = new THREE.CanvasTexture(c) }
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
        pm.map = t; pm.needsUpdate = true
        try { gl.initTexture(t) } catch { /* uploaded on first draw */ }       // upload now, not mid-swipe
        st.current.ready = true
      })
    }, 200 + i * 220)
    return () => clearTimeout(id)
  }, [i, gl, pm])
  useFrame((_, dt) => {
    const s = st.current, w = world(), d = i - rig.p, a = Math.abs(d), fd = ringFade(a), o = ringAt(d)
    /* the ring: each piece turns about ITS OWN centre (the group origin is the piece), so nothing swings sideways */
    g.current!.position.set(rig.p * w.spacing + o.x * w.spacing, 0, -o.z * w.spacing); g.current!.rotation.y = -o.th
    g.current!.visible = fd > 0.01
    s.a = i === rig.index ? Math.min(1, s.a + dt / 0.7) : Math.max(0, s.a - dt / 0.45)          // "this piece is the focused one", eased
    s.k = Math.min(1, s.k + dt / 0.5)
    const nW = w.pieceW * 1.16, nH = w.pieceH * 1.08
    niche.current!.position.set(0, 0, -0.9); niche.current!.scale.set(nW, nH, 1); nm.uniforms.uAsp.value = nW / nH; nm.uniforms.uI.value = (0.35 + 0.9 * s.a) * fd
    const pr = w.pieceW * 0.4 * (0.4 + 0.6 * fd)
    plinth.current!.position.set(0, -w.pieceH / 2 - 0.01 + w.pieceH * 0.025, 0.05); plinth.current!.scale.set(pr, w.pieceH * 0.05, pr * 0.55)
    ring.current!.position.set(0, -w.pieceH / 2 - 0.01 + w.pieceH * 0.05 + 0.004, 0.05); ring.current!.scale.set(pr, pr * 0.55, 1)
    rm.color.setRGB(0.5 + 3.0 * s.a, 0.34 + 2.0 * s.a, 0.12 + 0.6 * s.a)
    const op = fd * (s.ready ? clamp01(s.k) : 0), dim = 1 - Math.min(1, a / 1.15) * 0.55
    pm.opacity = op; pm.color.setRGB(dim, dim, dim)
    photo.current!.visible = op > 0.004; photo.current!.position.set(0, 0, 0.02); photo.current!.scale.set(w.pieceW, w.pieceH, 1)
    photo.current!.rotation.y = s.a * (Math.sin(performance.now() / 1000 * 0.7) * 0.07 + rig.pointer.x * 0.05)      // a slow living sway on the focused piece
    void smooth
  })
  return (
    <group ref={g}>
      <mesh ref={niche} material={nm}><planeGeometry /></mesh>
      <mesh ref={photo} material={pm} renderOrder={2} visible={false}><planeGeometry /></mesh>
      <mesh ref={plinth} material={plm} renderOrder={3}><cylinderGeometry args={[1, 1.06, 1, 48]} /></mesh>
      <mesh ref={ring} material={rm} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}><ringGeometry args={[0.94, 1, 64]} /></mesh>
    </group>
  )
}
export const Ring = () => <>{PIECES.map((_, i) => <Piece key={i} i={i} />)}</>
