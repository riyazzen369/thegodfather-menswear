import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { MeshReflectorMaterial, PerformanceMonitor } from '@react-three/drei'
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { ITEMS, LOGO, STORE } from '../data'
import { rig, easeInOut, easeOut, clamp01, smooth } from '../rig'

/* ---------------- world constants ---------------- */
const FOV = 40
const PZ = -10          // plane of the pieces
const D = 6             // camera distance to the pieces
const CAM_W = PZ + D    // camera z in the wardrobe
const GATE_Z = 8        // logo doors
const GATE_CAM = 12     // camera z at the gate
const TAN = Math.tan((FOV / 2) * Math.PI / 180)
const LAST = ITEMS.length

const now = () => performance.now()
/* monotone cubic through keyframes (Fritsch-Carlson), zero end tangents */
function spline(ks: [number, number][]) {
  const n = ks.length, d: number[] = [], m: number[] = new Array(n).fill(0)
  for (let i = 0; i < n - 1; i++) d.push((ks[i + 1][1] - ks[i][1]) / (ks[i + 1][0] - ks[i][0]))
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i] }
  }
  return (t: number) => {
    if (t <= ks[0][0]) return ks[0][1]
    if (t >= ks[n - 1][0]) return ks[n - 1][1]
    let i = 0; while (t > ks[i + 1][0]) i++
    const h = ks[i + 1][0] - ks[i][0], u = (t - ks[i][0]) / h, u2 = u * u, u3 = u2 * u
    return (2 * u3 - 3 * u2 + 1) * ks[i][1] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ks[i + 1][1] + (u3 - u2) * h * m[i + 1]
  }
}
const PHOTO_Z = 1.2, CURTAIN_Z = 2.6
const DESCENT_MS = 2400
const dolly = spline([[0.3, GATE_CAM], [1.25, 6.2], [1.95, 3.6], [2.5, PZ + D]])
const T = () => rig.view === 'gate' ? 0 : rig.view === 'transition' ? (rig.freeze ?? (now() - rig.transStart) / 1000) : 99

/* Layout: map the DOM stage box to world units so 3D pieces sit exactly where the overlay expects them */
function world() {
  const L = rig.layout
  const visH = 2 * D * TAN, unit = visH / L.H, visW = L.W * unit
  const ph = Math.min(L.sh, L.sw * 4 / 3), pw = ph * 0.75
  const pieceH = ph * unit, pieceW = pw * unit
  const spacing = ((0.92 * L.W - L.sx) + pw * 0.34) * unit          // next piece peeks in from the right edge
  const camOffset = -(L.sx - L.W / 2) * unit
  const py = (L.H / 2 - L.sy) * unit
  return { visH, visW, unit, pieceH, pieceW, spacing, camOffset, py, floorY: py - pieceH / 2 - 0.01 }
}
const camXAt = (p: number, w = world()) => p * w.spacing + w.camOffset

/* ---------------- shaders ---------------- */
const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`
const VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vH; uniform float uHgt;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
vH = (position.y / max(uHgt, 0.0001)) + 0.5; gl_Position = projectionMatrix * mv; }`
const VELVET = `
vec3 velvet(vec2 uv, float t){
  float x = uv.x * 26.0 + sin(uv.y * 2.3 + uv.x * 4.0 + t * 0.3) * 0.7 + sin(uv.x * 9.1) * 1.3;
  float f = pow(0.5 + 0.5 * sin(x), 1.5);
  float f2 = pow(0.5 + 0.5 * sin(x * 0.47 + 1.7), 3.0);
  vec3 base = vec3(0.34, 0.012, 0.035);
  vec3 hi = vec3(0.9, 0.05, 0.08);
  vec3 c = mix(base * 0.12, base, f) + hi * pow(f, 7.0) * 0.32 + hi * f2 * 0.06;
  c *= mix(0.25, 1.0, smoothstep(0.0, 0.85, uv.y));
  return c;
}`

function pieceMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uMap: { value: null }, uB: { value: 0.2 }, uHas: { value: 0 }, uHgt: { value: 1 } },
    vertexShader: VS,
    fragmentShader: `uniform sampler2D uMap; uniform float uB; uniform float uHas; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(uMap, vUv);
      vec2 d = abs(vUv - 0.5) * 2.0;
      float m = (1.0 - smoothstep(0.6, 1.0, d.x)) * (1.0 - smoothstep(0.78, 1.0, d.y));
      gl_FragColor = vec4(c.rgb * uB, m * uHas);
      #include <colorspace_fragment>
    }`
  })
}
function glowMat(color: THREE.Color, radial = true) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uI: { value: 0 }, uC: { value: color } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uI; uniform vec3 uC; varying vec2 vUv;
    void main(){ float r = length(vUv - 0.5) * 2.0; float a = ${radial ? 'pow(1.0 - smoothstep(0.0, 1.0, r), 2.2)' : '1.0'};
      gl_FragColor = vec4(uC * a * uI, 1.0); }`
  })
}
function coneMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uI: { value: 0 }, uHgt: { value: 1 } },
    vertexShader: VS,
    fragmentShader: `uniform float uI; varying vec3 vN; varying vec3 vV; varying float vH;
    void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
      float a = f * (0.2 + 0.8 * vH) * (1.0 - smoothstep(0.42, 0.86, vH)) * uI * 0.22;
      gl_FragColor = vec4(vec3(1.0, 0.8, 0.46) * a, 1.0); }`
  })
}
/* gold niche around each anchor: an arched frame with a soft glow */
function nicheMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uI: { value: 0 }, uAsp: { value: 0.75 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uI; uniform float uAsp; varying vec2 vUv;
    float sdArch(vec2 p, vec2 b){ // rect with a round top, p centred, b half size
      float r = b.x; vec2 q = p; float top = b.y - r;
      if (q.y > top) return length(vec2(q.x, q.y - top)) - r;
      vec2 d = abs(q) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
    void main(){
      vec2 p = (vUv - 0.5) * vec2(uAsp, 1.0);
      float d = sdArch(p, vec2(uAsp * 0.44, 0.47));
      float line = exp(-abs(d) * 220.0) + exp(-abs(d + 0.018) * 420.0) * 0.5;
      float glow = exp(-max(d, 0.0) * 30.0) * 0.18 * step(0.0, d);
      float inner = (1.0 - smoothstep(-0.2, 0.0, d)) * 0.05;
      vec3 gold = vec3(1.0, 0.72, 0.32);
      gl_FragColor = vec4(gold * (line * 1.6 + glow + inner) * uI, 1.0); }`
  })
}
function velvetMat(opts: { quadEdges?: boolean } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: !opts.quadEdges, depthTest: !opts.quadEdges, toneMapped: false,
    uniforms: { uT: { value: 0 }, uO: { value: 1 }, uAspect: { value: 1 } },
    vertexShader: opts.quadEdges ? QUAD_VS : `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uT; uniform float uO; uniform float uAspect; varying vec2 vUv; ${VELVET}
    void main(){
      ${opts.quadEdges
        ? `float w = 0.035 / max(uAspect, 0.5) * 0.9 + 0.02; float e = min(vUv.x, 1.0 - vUv.x);
           float a = 1.0 - smoothstep(w * 0.55, w, e); float top = 1.0 - smoothstep(0.0, 0.05, 1.0 - vUv.y);
           a = max(a, top * 0.9); vec3 c = velvet(vec2(vUv.x * 3.0, vUv.y), uT);
           gl_FragColor = vec4(c, a * uO);`
        : `vec3 c = velvet(vUv, uT); gl_FragColor = vec4(c, uO);`}
      #include <colorspace_fragment>
    }`
  })
}

/* ---------------- textures ---------------- */
const loader = new THREE.TextureLoader()
function loadTex(url: string, cb: (t: THREE.Texture) => void) {
  loader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; cb(t) })
}
/* brass panelling for the vault walls */
function brassTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 512, 0)
  grd.addColorStop(0, '#2a1d0c'); grd.addColorStop(0.5, '#5a4119'); grd.addColorStop(1, '#2a1d0c')
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(${200 + Math.random() * 55},${150 + Math.random() * 50},${70 + Math.random() * 40},${Math.random() * 0.05})`; g.fillRect(0, Math.random() * 512, 512, 1) }
  const panel = (x: number, y: number, w: number, h: number) => {
    g.strokeStyle = 'rgba(10,6,2,.85)'; g.lineWidth = 8; g.strokeRect(x, y, w, h)
    g.strokeStyle = 'rgba(255,214,130,.35)'; g.lineWidth = 2; g.strokeRect(x + 7, y + 7, w - 14, h - 14)
    g.strokeStyle = 'rgba(255,224,150,.18)'; g.lineWidth = 1; g.strokeRect(x + 16, y + 16, w - 32, h - 32)
  }
  panel(24, 24, 464, 300); panel(24, 352, 464, 136)
  g.fillStyle = 'rgba(8,5,2,.9)'; g.fillRect(0, 0, 6, 512); g.fillRect(506, 0, 6, 512)
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
/* dark marble for the vault floor */
function marbleTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#0d0b0a'; g.fillRect(0, 0, 512, 512)
  for (let k = 0; k < 26; k++) {
    g.strokeStyle = `rgba(${150 + Math.random() * 60},${120 + Math.random() * 40},${90 + Math.random() * 30},${0.05 + Math.random() * 0.12})`
    g.lineWidth = 0.6 + Math.random() * 1.6
    g.beginPath(); let x = Math.random() * 512, y = 0; g.moveTo(x, y)
    while (y < 512) { x += (Math.random() - 0.5) * 40; y += 10 + Math.random() * 30; g.lineTo(x, y) }
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
function useLogo() {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => { loadTex(LOGO, setTex) }, [])
  return tex
}

/* ---------------- camera ---------------- */
function CameraRig() {
  const { camera } = useThree()
  const look = useMemo(() => new THREE.Vector3(), [])
  const cur = useRef({ x: 0, y: 0, z: GATE_CAM, init: false })
  useFrame((_, dt) => {
    const w = world(), t = T()
    const x0 = camXAt(0, w)
    const px = rig.pointer.x, py = rig.pointer.y
    let x: number, y: number, z: number, lx: number, ly: number, lz: number
    if (rig.view === 'gate') {
      x = x0 + px * 0.35; y = py * 0.22; z = GATE_CAM; lx = x0; ly = 0; lz = GATE_Z
      cur.current = { x, y, z, init: true }
    } else if (rig.view === 'transition') {
      z = dolly(t)
      const k = clamp01((GATE_CAM - z) / (GATE_CAM - CAM_W))
      x = x0 + px * 0.35 * (1 - k); y = py * 0.22 * (1 - k) + w.py * 0.0
      lx = x0; ly = 0; lz = z - 6
      cur.current = { x, y, z, init: true }
    } else {
      const nud = rig.nudgeAt ? Math.sin(clamp01((now() - rig.nudgeAt) / 560) * Math.PI) * 26 * rig.nudgeDir : 0
      /* descent into the vault: start high and back, glide down the stairwell onto the rail */
      const dk = rig.descentAt ? clamp01((now() - rig.descentAt) / DESCENT_MS) : 1
      const up = 1 - easeInOut(dk)
      const tx = camXAt(rig.scrollP, w) + (rig.over * 0.3 + nud) * w.unit + px * 0.12
      const ty = py * 0.08 + up * 5.5
      const tz = CAM_W + up * 4.5
      const c = cur.current, a = 1 - Math.exp(-dt * 14)
      if (rig.snap) { c.x = tx; c.y = ty; c.z = tz; rig.snap = false }
      if (up > 0) { c.x += (tx - c.x) * a; c.y = ty; c.z = tz } else { c.x += (tx - c.x) * a; c.y += (ty - c.y) * a; c.z += (tz - c.z) * a }
      x = c.x; y = c.y; z = c.z; lx = x - px * 0.05; ly = c.y * 0.5 - up * 2.2; lz = PZ
    }
    camera.position.set(x, y, z)
    look.set(lx, ly, lz); camera.lookAt(look)
  })
  return null
}

/* ---------------- gate: neon logo doors ---------------- */
function Gate() {
  const logo = useLogo()
  const L = useRef<THREE.Group>(null), R = useRef<THREE.Group>(null), root = useRef<THREE.Group>(null)
  const wall = useRef<THREE.Mesh>(null), halo = useRef<THREE.Mesh>(null), slit = useRef<THREE.Mesh>(null)
  const mats = useMemo(() => [0, 1].map(() => new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false, opacity: 0 })), [])
  const haloMat = useMemo(() => glowMat(new THREE.Color(1.0, 0.04, 0.06)), [])
  const slitMat = useMemo(() => glowMat(new THREE.Color(1.0, 0.55, 0.38)), [])
  const wallMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#050303', transparent: true }), [])
  const geos = useMemo(() => [0, 1].map(side => {
    const g = new THREE.PlaneGeometry(0.5, 1)
    g.translate(side === 0 ? 0.25 : -0.25, 0, 0)
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + (side === 0 ? 0 : 0.5))
    return g
  }), [])
  useEffect(() => { if (logo) mats.forEach(m => { m.map = logo; m.needsUpdate = true }) }, [logo, mats])
  useFrame(() => {
    const w = world(), t = T(), x0 = camXAt(0, w)
    // logo size on screen: min(78vw, 560px), same as the DOM tap target
    const visHg = 2 * (GATE_CAM - GATE_Z) * TAN, unitG = visHg / rig.layout.H
    const pxW = Math.min(rig.layout.W * 0.78, 560), lw = pxW * unitG, lh = lw * (1180 / 1550)
    root.current!.position.set(x0, 0.06 * visHg, GATE_Z)
    root.current!.scale.set(lw, lh, 1)
    const since = rig.view === 'gate' ? (now() - rig.gateAt) / 1000 : 9
    const appear = smooth(0.8, 2.1, since)
    const breathe = 1.75 + 0.55 * Math.sin(now() / 1000 * Math.PI * 2 / 4.8)
    const open = easeInOut(clamp01(t / 1.0))
    const fadeOut = 1 - smooth(1.0, 1.45, t)
    L.current!.position.x = -0.5 - open * 0.08; R.current!.position.x = 0.5 + open * 0.08
    L.current!.rotation.y = -open * 1.85; R.current!.rotation.y = open * 1.85
    const op = (logo ? 1 : 0) * appear * fadeOut
    mats.forEach(m => { m.opacity = op; m.color.setScalar(rig.view === 'gate' ? breathe : 2.3 + open * 1.5) })
    haloMat.uniforms.uI.value = op * (0.22 + 0.1 * Math.sin(now() / 1000 * Math.PI * 2 / 4.8)) * (1 - open)
    slitMat.uniforms.uI.value = smooth(0.02, 0.5, t) * (1 - smooth(0.85, 1.35, t)) * 1.6
    slit.current!.scale.set(0.05 + open * 1.4, 1.1 + open * 0.8, 1)
    wallMat.opacity = 1 - smooth(0.55, 1.15, t)
    wall.current!.visible = wallMat.opacity > 0.001
    halo.current!.visible = haloMat.uniforms.uI.value > 0.001
  })
  return (
    <group>
      <group ref={root}>
        <mesh ref={halo} position={[0, 0, -0.3]} scale={[2.6, 2.6, 1]} material={haloMat}><planeGeometry /></mesh>
        <mesh ref={slit} position={[0, 0, -0.05]} material={slitMat}><planeGeometry /></mesh>
        <group ref={L} position={[-0.5, 0, 0]}><mesh geometry={geos[0]} material={mats[0]} /></group>
        <group ref={R} position={[0.5, 0, 0]}><mesh geometry={geos[1]} material={mats[1]} /></group>
      </group>
      <mesh ref={wall} position={[0, 0, GATE_Z - 0.4]} material={wallMat}><planeGeometry args={[400, 200]} /></mesh>
    </group>
  )
}

/* ---------------- storefront: the user's store photo with parallax + red curtains ---------------- */
function Storefront() {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  const g = useRef<THREE.Group>(null), cl = useRef<THREE.Mesh>(null), cr = useRef<THREE.Mesh>(null)
  useEffect(() => { const id = setTimeout(() => loadTex(STORE(window.innerWidth), setTex), 300); return () => clearTimeout(id) }, [])
  const mk = (v0: number, v1: number) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uMap: { value: null }, uO: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uO; varying vec2 vUv;
      void main(){ vec2 uv = vec2(vUv.x, ${v0.toFixed(3)} + vUv.y * ${(v1 - v0).toFixed(3)});
        vec4 c = texture2D(uMap, uv);
        float red = smoothstep(0.5, 0.85, c.r) * (1.0 - smoothstep(0.12, 0.3, c.g));
        vec3 col = c.rgb * (1.0 + red * 2.2);
        float edge = (1.0 - smoothstep(0.9, 1.0, abs(vUv.x - 0.5) * 2.0)) * ${v0 > 0 ? '(1.0 - smoothstep(0.85,1.0,vUv.y))' : '1.0'};
        gl_FragColor = vec4(col, uO * edge);
        #include <colorspace_fragment>
      }`
  })
  const main = useMemo(() => mk(0.26, 1.0), []), street = useMemo(() => mk(0.0, 0.3), [])
  const vl = useMemo(() => velvetMat(), []), vr = useMemo(() => velvetMat(), [])
  useEffect(() => { if (tex) { main.uniforms.uMap.value = tex; street.uniforms.uMap.value = tex } }, [tex, main, street])
  useFrame(() => {
    const t = T(), w = world(), x0 = camXAt(0, w)
    const h = 2 * (3.6 - PHOTO_Z) * TAN * 1.12, wid = h * 16 / 9
    g.current!.position.set(x0, 0, 0)
    const vis = (tex ? 1 : 0) * smooth(0.8, 1.1, t) * (1 - smooth(1.98, 2.2, t))
    main.uniforms.uO.value = vis; street.uniforms.uO.value = vis
    const m = g.current!.children
    m[0].scale.set(wid, h * 0.74, 1); m[0].position.set(0, h * 0.13, PHOTO_Z)
    const k = (3.6 - (PHOTO_Z + 0.4)) / (3.6 - PHOTO_Z)
    m[1].scale.set(wid * k, h * 0.3 * k, 1); m[1].position.set(0, (-h * 0.5 + h * 0.15) * k, PHOTO_Z + 0.4)
    const part = easeInOut(clamp01((t - 1.12) / 0.75))
    // curtains always span the visible width at their depth, then part to the sides
    const dz = Math.max(0.4, dolly(Math.min(t, 2.5)) - CURTAIN_Z)
    const hw = dz * TAN * (rig.layout.W / rig.layout.H) * 1.08, ch = dz * TAN * 2.4
    const cw = hw * 1.25
    cl.current!.scale.set(cw, ch, 1); cr.current!.scale.set(cw, ch, 1)
    cl.current!.position.set(x0 - cw / 2 + 0.01 - part * hw * 1.15, 0, CURTAIN_Z)
    cr.current!.position.set(x0 + cw / 2 - 0.01 + part * hw * 1.15, 0, CURTAIN_Z)
    const cv = t > 0.4 && t < 2.3 ? 1 : 0
    vl.uniforms.uO.value = vr.uniforms.uO.value = cv
    vl.uniforms.uT.value = vr.uniforms.uT.value = now() / 1000
    cl.current!.visible = cr.current!.visible = cv > 0
    g.current!.visible = t > 0.3 && t < 2.4
  })
  return (
    <>
      <group ref={g}>
        <mesh material={main}><planeGeometry /></mesh>
        <mesh material={street}><planeGeometry /></mesh>
      </group>
      <mesh ref={cl} material={vl}><planeGeometry /></mesh>
      <mesh ref={cr} material={vr}><planeGeometry /></mesh>
    </>
  )
}

/* ---------------- light flood + edge drapes (screen-space) ---------------- */
function ScreenFX() {
  const flood = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uO: { value: 0 } }, vertexShader: QUAD_VS,
    fragmentShader: `uniform float uO; varying vec2 vUv; void main(){ vec2 d = (vUv - 0.5) * vec2(1.4, 1.0); float r = length(d) * 2.0;
      vec3 warm = vec3(1.0, 0.72, 0.5); vec3 red = vec3(0.95, 0.03, 0.05);
      vec3 c = mix(warm, red, smoothstep(0.0, 0.9, r)) * (1.0 - smoothstep(0.6, 1.6, r) * 0.6);
      gl_FragColor = vec4(c * uO * 1.6, 1.0); }`
  }), [])
  const drapes = useMemo(() => velvetMat({ quadEdges: true }), [])
  const { size } = useThree()
  useFrame(() => {
    const t = T()
    flood.uniforms.uO.value = smooth(0.62, 0.98, t) * (1 - smooth(1.02, 1.48, t)) * 0.8
    drapes.uniforms.uO.value = smooth(1.7, 2.5, t)
    drapes.uniforms.uT.value = now() / 1000
    drapes.uniforms.uAspect.value = size.width / size.height
  })
  return (
    <>
      <mesh frustumCulled={false} renderOrder={998} material={drapes}><planeGeometry /></mesh>
      <mesh frustumCulled={false} renderOrder={999} material={flood}><planeGeometry /></mesh>
    </>
  )
}

/* ---------------- the room ---------------- */
function Room({ low }: { low: boolean }) {
  const wood = useMemo(() => brassTexture(), [])
  const marble = useMemo(() => marbleTexture(), [])
  const wallMat = useMemo(() => new THREE.MeshBasicMaterial({ map: wood, color: new THREE.Color(0.85, 0.74, 0.6) }), [wood])
  const stripMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 2.3, 0.8), toneMapped: false }), [])
  const endL = useMemo(() => velvetMat(), []), endR = useMemo(() => velvetMat(), [])
  const g = useRef<THREE.Group>(null)
  const { size } = useThree()
  useFrame(() => {
    const w = world(), span = (LAST + 2) * w.spacing + 40
    const [wall, s1, s2, floor, cL, cR] = g.current!.children as THREE.Mesh[]
    const x0 = -w.spacing - 10
    wall.scale.set(span, 16, 1); wall.position.set(x0 + span / 2, w.floorY + 8, PZ - 1.6)
    wood.repeat.set(span / 1.6, 1)
    s1.scale.set(span, 0.018, 1); s1.position.set(x0 + span / 2, w.floorY + 0.03, PZ - 1.55)
    s2.scale.set(span, 0.012, 1); s2.position.set(x0 + span / 2, w.py + w.pieceH * 0.5 + w.visH * 0.32, PZ - 1.55)
    floor.position.set(x0 + span / 2, w.floorY, PZ + 2); floor.scale.set(span, 16, 1)
    marble.repeat.set(span / 6, 16 / 6)
    const ch = 12
    cL.scale.set(4, ch, 1); cL.position.set(camXAt(0, w) - w.visW * 0.5 - 2.6, w.floorY + ch / 2, PZ - 0.3)
    cR.scale.set(4, ch, 1); cR.position.set(camXAt(LAST, w) + w.visW * 0.5 + 2.6, w.floorY + ch / 2, PZ - 0.3)
    endL.uniforms.uT.value = endR.uniforms.uT.value = now() / 1000
  })
  const res = low ? 128 : size.width < 700 ? 256 : 512
  return (
    <group ref={g}>
      <mesh material={wallMat}><planeGeometry /></mesh>
      <mesh material={stripMat}><planeGeometry /></mesh>
      <mesh material={stripMat}><planeGeometry /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry />
        {low
          ? <meshBasicMaterial map={marble} color="#8a7a70" />
          : <MeshReflectorMaterial resolution={res} mirror={0.7} blur={[280, 90]} mixBlur={1} mixStrength={3.4} depthScale={1.1}
              minDepthThreshold={0.4} maxDepthThreshold={1.4} roughness={0.85} metalness={0.5} color="#2a2420" map={marble} />}
      </mesh>
      <mesh material={endL}><planeGeometry /></mesh>
      <mesh material={endR}><planeGeometry /></mesh>
    </group>
  )
}

/* ---------------- one piece in the wardrobe ---------------- */
function Piece({ i }: { i: number }) {
  const g = useRef<THREE.Group>(null), plane = useRef<THREE.Mesh>(null), cone = useRef<THREE.Mesh>(null)
  const pool = useRef<THREE.Mesh>(null), wallPool = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => pieceMat(), []), cm = useMemo(() => coneMat(), [])
  const pm = useMemo(() => glowMat(new THREE.Color(1.0, 0.76, 0.4)), []), wm = useMemo(() => glowMat(new THREE.Color(0.95, 0.66, 0.3)), [])
  const plinth = useRef<THREE.Mesh>(null), ring = useRef<THREE.Mesh>(null), niche = useRef<THREE.Mesh>(null)
  const nm = useMemo(() => nicheMat(), [])
  const plMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.07, 0.055, 0.045) }), [])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.3), toneMapped: false }), [])
  const st = useRef({ a: 0, s: 0, loading: false, wasActive: false })
  useFrame((_, dt) => {
    const s = st.current
    if (!s.loading && i <= rig.loadUpTo) {
      s.loading = true
      loadTex(ITEMS[i].images[0].src, t => { mat.uniforms.uMap.value = t; mat.uniforms.uHas.value = 1 })
    }
    const w = world(), active = rig.index === i && rig.view !== 'gate'
    const tnow = now()
    if (active) {
      const since = tnow - (rig.activeAt[i] || tnow)
      s.a = easeOut(clamp01(since / 700))
      s.s = clamp01((since - 180) / 800)
    } else {
      s.a = Math.max(0, s.a - dt / 0.45)
      s.s = Math.max(0, s.s - dt / 0.45)
    }
    const a = s.a, sc = 0.84 + 0.16 * a
    const from = active ? rig.dir * (1 - a) * 0.12 * w.pieceW : 0
    g.current!.position.set(i * w.spacing, 0, 0)
    plane.current!.position.set(from, w.py, PZ - (1 - a) * 0.9)
    plane.current!.scale.set(w.pieceW * sc, w.pieceH * sc, 1)
    /* on its anchor: a slow turn and a little depth with the pointer */
    const tt = tnow / 1000
    plane.current!.rotation.y = a * (Math.sin(tt * 0.45 + i) * 0.14 + rig.pointer.x * 0.12)
    plane.current!.rotation.x = a * rig.pointer.y * -0.05
    const pr = w.pieceW * 0.4, ph = w.pieceH * 0.05
    plinth.current!.position.set(0, w.floorY + ph / 2, PZ + 0.05); plinth.current!.scale.set(pr, ph, pr * 0.55)
    ring.current!.position.set(0, w.floorY + ph + 0.004, PZ + 0.05); ring.current!.scale.set(pr, pr * 0.55, 1)
    const nW = w.pieceW * 1.16, nH = w.pieceH * 1.08
    niche.current!.position.set(0, w.py + w.pieceH * 0.02, PZ - 0.9); niche.current!.scale.set(nW, nH, 1)
    nm.uniforms.uAsp.value = nW / nH; nm.uniforms.uI.value = 0.35 + 0.9 * s.s
    ringMat.color.setRGB(0.5 + 3.0 * s.s, 0.34 + 2.0 * s.s, 0.12 + 0.6 * s.s)
    mat.uniforms.uB.value = 0.28 + 0.72 * a
    const coneH = w.pieceH * 1.9
    cone.current!.position.set(0, w.floorY + coneH / 2, PZ - 0.35)
    cone.current!.scale.set(w.pieceW * 0.62, coneH, w.pieceW * 0.4)
    cm.uniforms.uHgt.value = 1
    cm.uniforms.uI.value = 0.18 + 0.82 * s.s
    pool.current!.position.set(0, w.floorY + 0.005, PZ - 0.2); pool.current!.scale.set(w.pieceW * 1.6, w.pieceW * 0.7, 1)
    pm.uniforms.uI.value = 0.04 + 0.16 * s.s
    wallPool.current!.position.set(0, w.py + w.pieceH * 0.15, PZ - 1.58); wallPool.current!.scale.set(w.pieceW * 2.4, w.pieceH * 1.7, 1)
    wm.uniforms.uI.value = 0.03 + 0.16 * s.s
  })
  return (
    <group ref={g}>
      <mesh ref={wallPool} material={wm}><planeGeometry /></mesh>
      <mesh ref={niche} material={nm}><planeGeometry /></mesh>
      <mesh ref={cone} material={cm}><cylinderGeometry args={[0.06, 1, 1, 40, 1, true]} /></mesh>
      <mesh ref={pool} rotation={[-Math.PI / 2, 0, 0]} material={pm}><planeGeometry /></mesh>
      <mesh ref={plane} material={mat} renderOrder={2}><planeGeometry /></mesh>
      <mesh ref={plinth} material={plMat} renderOrder={3}><cylinderGeometry args={[1, 1.06, 1, 48]} /></mesh>
      <mesh ref={ring} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}><ringGeometry args={[0.94, 1, 64]} /></mesh>
    </group>
  )
}

/* ---------------- final panel sign ---------------- */
function FinalSign() {
  const logo = useLogo(), m = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false, opacity: 0 }), [])
  useEffect(() => { if (logo) { mat.map = logo; mat.needsUpdate = true } }, [logo, mat])
  useFrame(() => {
    const w = world(), wid = Math.min(w.visW * 0.62, w.visH * 0.62)
    m.current!.position.set(camXAt(LAST, w), w.visH * 0.22, PZ - 1.2)
    m.current!.scale.set(wid, wid * 1180 / 1550, 1)
    const near = clamp01(1 - Math.abs(rig.scrollP - LAST) / 1.2)
    mat.opacity = logo ? 0.25 + 0.75 * near : 0
    mat.color.setScalar(1.6 + 0.9 * near + 0.25 * Math.sin(now() / 1000 * 1.3))
  })
  return <mesh ref={m} material={mat}><planeGeometry /></mesh>
}

/* ---------------- dust in the light ---------------- */
function Dust() {
  const ref = useRef<THREE.Points>(null)
  const N = 260
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry(), p = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) { p[i * 3] = Math.random(); p[i * 3 + 1] = Math.random(); p[i * 3 + 2] = Math.random() }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); return g
  }, [])
  const mat = useMemo(() => new THREE.PointsMaterial({ size: 0.018, color: new THREE.Color(1.3, 0.95, 0.55), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  useFrame(() => {
    const w = world(), t = now() / 1000
    const cx = rig.view === 'wardrobe' ? camXAt(rig.scrollP, w) : camXAt(0, w)
    ref.current!.position.set(cx - w.visW * 0.9, w.floorY + (t * 0.02) % 0.2 - 0.1, PZ - 1.2)
    ref.current!.scale.set(w.visW * 1.8, w.visH * 1.1, 3.5)
    ref.current!.rotation.z = Math.sin(t * 0.05) * 0.01
  })
  return <points ref={ref} geometry={geo} material={mat} />
}

function Stats() {
  const acc = useRef({ f: 0, t: performance.now() })
  useFrame(() => {
    const a = acc.current; a.f++
    const n = performance.now()
    if (n - a.t > 1000) { rig.fps = Math.round(a.f * 1000 / (n - a.t)); (window as any).__fps = rig.fps; a.f = 0; a.t = n }
  })
  return null
}
function Ready({ onReady }: { onReady: () => void }) {
  const done = useRef(false)
  useFrame(() => { if (!done.current) { done.current = true; requestAnimationFrame(() => onReady()) } })
  return null
}

export default function Experience({ onReady, paused = false }: { onReady: () => void; paused?: boolean }) {
  const [low, setLow] = useState(false)
  const [dpr, setDpr] = useState(Math.min(1.75, window.devicePixelRatio || 1))
  return (
    <Canvas className="gl" dpr={dpr} frameloop={paused ? 'demand' : 'always'} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 0, GATE_CAM] }}
      onCreated={({ gl, scene }) => { gl.setClearColor('#050303'); scene.fog = new THREE.Fog('#050303', 9, 30) }}
      aria-hidden="true">
      <PerformanceMonitor onDecline={() => { setDpr(1); setLow(true); rig.low = true }} flipflops={2} onFallback={() => { setDpr(1); setLow(true); rig.low = true }} />
      <ambientLight intensity={1.2} />
      <CameraRig />
      <Room low={low} />
      {ITEMS.map((_, i) => <Piece key={i} i={i} />)}
      <FinalSign />
      <Dust />
      <Storefront />
      <Gate />
      <ScreenFX />
      <Stats />
      <Ready onReady={onReady} />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={low ? 0.8 : 1.15} luminanceThreshold={0.95} luminanceSmoothing={0.2} radius={0.75} />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.22} />
        <Vignette offset={0.28} darkness={0.82} />
      </EffectComposer>
    </Canvas>
  )
}
