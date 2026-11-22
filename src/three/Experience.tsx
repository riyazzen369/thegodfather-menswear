import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { MeshReflectorMaterial, PerformanceMonitor } from '@react-three/drei'
import { EffectComposer, Bloom, Noise, Vignette, DepthOfField } from '@react-three/postprocessing'
import { BlendFunction, type DepthOfFieldEffect } from 'postprocessing'
import * as THREE from 'three'
import { ITEMS, STORE } from '../data'
import { rig, easeInOut, easeOut, clamp01, smooth, WALK_MS, walkTime } from '../rig'

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
const QS = new URLSearchParams(location.search)
const HQ = QS.has('hq')            // debug: never drop quality
const FORCE3D = QS.has('force3d')  // debug: never fall back to 2D for slowness
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

/* ---------------- camera ---------------- */
function CameraRig({ path }: { path: { current: WalkPath | null } }) {
  const { camera, size } = useThree()
  const setFov = (f: number) => { const c = camera as THREE.PerspectiveCamera; if (Math.abs(c.fov - f) > 0.01) { c.fov = f; c.updateProjectionMatrix() } }
  const look = useMemo(() => new THREE.Vector3(), [])
  const v = useMemo(() => ({ p: new THREE.Vector3(), q: new THREE.Vector3(), f: new THREE.Vector3() }), [])
  const cur = useRef({ x: 0, y: 0, z: GATE_CAM, init: false })
  useFrame((_, dt) => {
    const w = world(), t = T()
    const x0 = camXAt(0, w)
    const px = rig.pointer.x, py = rig.pointer.y
    let x: number, y: number, z: number, lx: number, ly: number, lz: number
    let roll = 0
    const walkT = walkTime()
    if (walkT >= 0 && walkT < WALK_MS / 1000) {
      /* first person along one spline; the path is rebuilt only when the layout changes the floor height */
      const endY = -w.floorY
      if (!path.current || Math.abs(path.current.key - endY) > 1e-4) path.current = makeWalk(endY)
      const P = path.current, d = P.dist(walkT), u = clamp01(d / P.total)
      P.curve.getPointAt(u, v.p)
      P.curve.getPointAt(Math.min(1, u + 3.2 / P.total), v.q)
      const speed = (P.dist(walkT + 0.06) - P.dist(Math.max(0, walkT - 0.06))) / 0.12
      const settle = 1 - smooth(0.86, 1.0, u)
      const amp = clamp01(speed / 2.6) * settle
      /* head-bob (two steps per 1.4 m) and a little sway, gone by the time we reach the anchor */
      const bob = Math.sin(d * Math.PI * 1.45) * 0.03 * amp, sway = Math.sin(d * Math.PI * 0.725) * 0.022 * amp
      roll = Math.sin(d * Math.PI * 0.725 + 0.6) * 0.006 * amp
      x = x0 + v.p.x + sway; y = w.floorY + v.p.y + Math.abs(bob) - 0.015 * amp; z = v.p.z
      /* look ahead along the path (a little less steep on the stairs), handing over to the wardrobe's own aim at the end */
      v.f.set(x0 + v.q.x, w.floorY + v.p.y + (v.q.y - v.p.y) * 0.55, v.q.z)
      const hand = smooth(0.8, 1.0, u)
      /* glance at the racks on the way through the shop */
      v.f.x += Math.sin(walkT * 0.9 - 0.4) * 1.1 * smooth(0.03, 0.09, u) * (1 - smooth(0.2, 0.3, u))
      /* wider lens while walking (much wider in portrait), back to the wardrobe's 40 degrees on arrival */
      const asp = size.width / size.height, wide = asp < 1 ? 68 : asp < 1.4 ? 54 : 47
      setFov(THREE.MathUtils.lerp(wide, FOV, hand))
      lx = THREE.MathUtils.lerp(v.f.x, x - px * 0.05, hand); ly = THREE.MathUtils.lerp(v.f.y, y * 0.5, hand); lz = THREE.MathUtils.lerp(v.f.z, PZ, hand)
      cur.current = { x, y, z, init: true }
    } else if ((setFov(FOV), rig.view === 'gate')) {
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
    if (roll) camera.rotateZ(roll)
  })
  return null
}

/* ---------------- gate: the light through the opening doors (the logo itself is crisp DOM above the canvas) ---------------- */
function Gate() {
  const root = useRef<THREE.Group>(null), wall = useRef<THREE.Mesh>(null), slit = useRef<THREE.Mesh>(null)
  const slitMat = useMemo(() => glowMat(new THREE.Color(1.0, 0.55, 0.38)), [])
  const wallMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#050303', transparent: true }), [])
  useFrame(() => {
    const w = world(), t = T(), x0 = camXAt(0, w)
    const visHg = 2 * (GATE_CAM - GATE_Z) * TAN, unitG = visHg / rig.layout.H
    const pxW = Math.min(rig.layout.W * 0.78, 560), lw = pxW * unitG, lh = lw * (1180 / 1550)
    root.current!.position.set(x0, 0.06 * visHg, GATE_Z)
    root.current!.scale.set(lw, lh, 1)
    const open = easeInOut(clamp01(t / 1.0))
    slitMat.uniforms.uI.value = smooth(0.02, 0.5, t) * (1 - smooth(0.85, 1.35, t)) * 1.6
    slit.current!.scale.set(0.05 + open * 1.4, 1.1 + open * 0.8, 1)
    slit.current!.visible = slitMat.uniforms.uI.value > 0.001
    wallMat.opacity = 1 - smooth(0.55, 1.15, t)
    wall.current!.visible = wallMat.opacity > 0.001 && rig.view !== 'walk'
  })
  return (
    <group>
      <group ref={root}><mesh ref={slit} position={[0, 0, -0.05]} material={slitMat}><planeGeometry /></mesh></group>
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
    const wt = walkTime()
    drapes.uniforms.uO.value = smooth(1.7, 2.5, t) * (wt >= 0 ? smooth(WALK_MS / 1000 - 1.2, WALK_MS / 1000 + 0.4, wt) : 1)
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

/* ---------------- the premium walk: shop floor -> racks -> hidden wardrobe -> stairs -> vault ---------------- */
/* Built in a local frame whose origin is the first anchor on the vault floor (x0, floorY, 0); the camera looks down -z
   all the way, so the stairwell drops straight onto the rail where the wardrobe starts. */
const SHOP_Y = 5.2, EYE = 1.5, DOOR_Z = 22, WARD_Z = 11.8, STAIR_END = 4.6, STEPS = 12
const walkFog = { shop: new THREE.Color('#1c0507'), gold: new THREE.Color('#1d1406'), vault: new THREE.Color('#050303') }
type WalkPath = { curve: THREE.CatmullRomCurve3; total: number; dist: (t: number) => number; key: number }
function makeWalk(endY: number): WalkPath {
  const S = SHOP_Y, E = EYE
  const pts = [
    [0, S + E, 23.4], [0, S + E, 20.6], [0.22, S + E, 17.8], [-0.12, S + E, 15.2], [0, S + E, 13.3],
    [0, S + E - 0.2, 11.4], [0, 3.95, 8.2], [0, E + 0.35, 3.4], [0, endY + 0.15, -1.2], [0, endY, CAM_W]
  ].map(p => new THREE.Vector3(p[0], p[1], p[2]))
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
  curve.arcLengthDivisions = 400
  const L = curve.getLengths(400), total = L[400]
  const at = (k: number) => L[Math.round((k / (pts.length - 1)) * 400)]
  /* distance along the path over time: ease out of the doorway, walk the aisle, slow while the wardrobe opens,
     step through, take the stairs, glide onto the first anchor */
  const dist = spline([[0, 0], [1.4, at(1) * 0.75], [3.2, at(3)], [4.15, at(4) + 0.5], [4.9, at(5)], [7.25, at(7)], [WALK_MS / 1000, total]])
  return { curve, total, dist, key: endY }
}
function quad(a: number[], b: number[], c: number[], d: number[], uvRepeat = [1, 1]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3))
  const [u, v] = uvRepeat
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2))
  return g
}
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6, 1), mat)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return m
}
/* a hanging suit, lit from above: jacket, shirt + tie V, trousers */
function suitGeo() {
  const j = new THREE.Shape()
  j.moveTo(-0.08, 0.42); j.lineTo(-0.24, 0.36); j.lineTo(-0.29, 0.0); j.lineTo(-0.27, -0.42); j.lineTo(0.27, -0.42)
  j.lineTo(0.29, 0.0); j.lineTo(0.24, 0.36); j.lineTo(0.08, 0.42); j.lineTo(0, 0.1); j.closePath()
  const jacket = new THREE.ShapeGeometry(j)
  const v = new THREE.Shape(); v.moveTo(-0.08, 0.42); v.lineTo(0.08, 0.42); v.lineTo(0, 0.1); v.closePath()
  const shirt = new THREE.ShapeGeometry(v)
  const t = new THREE.Shape(); t.moveTo(-0.018, 0.4); t.lineTo(0.018, 0.4); t.lineTo(0.012, 0.16); t.lineTo(0, 0.12); t.lineTo(-0.012, 0.16); t.closePath()
  const tie = new THREE.ShapeGeometry(t)
  const shade = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const pos = g.attributes.position as THREE.BufferAttribute, col: number[] = []
    for (let i = 0; i < pos.count; i++) { const k = 0.35 + 0.75 * clamp01((pos.getY(i) + 0.45) / 0.9); col.push(c.r * k, c.g * k, c.b * k) }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g
  }
  return { jacket, shirt, tie, shade }
}
const SUIT_COLOURS = ['#1d2a44', '#2b2b2e', '#141416', '#4a1420', '#7d5f3c', '#bdb197', '#55565a', '#1e3328', '#3b2a20', '#2a1f3a']

function Walk({ low }: { low: boolean }) {
  const g = useRef<THREE.Group>(null)
  const mats = useMemo(() => {
    const marble = marbleTexture(); marble.repeat.set(2, 3)
    const marbleStair = marbleTexture(); marbleStair.repeat.set(1.2, 0.3)
    const wood = brassTexture(); wood.repeat.set(4, 1)
    const brass = brassTexture(); brass.repeat.set(5, 2)
    const doorWood = brassTexture()
    return {
      floor: new THREE.MeshBasicMaterial({ map: marble, color: new THREE.Color(0.55, 0.32, 0.3) }),
      wall: new THREE.MeshBasicMaterial({ map: wood, color: new THREE.Color(0.42, 0.12, 0.12), side: THREE.DoubleSide }),
      dark: new THREE.MeshBasicMaterial({ color: '#0b0405', side: THREE.DoubleSide }),
      runner: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.02, 0.04) }),
      street: new THREE.MeshBasicMaterial({ color: '#0a0607' }),
      glass: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.12, 0.14), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
      red: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 0.12, 0.2), toneMapped: false }),
      redDim: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.05, 0.08), toneMapped: false }),
      gold: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 2.3, 0.8), toneMapped: false }),
      goldDim: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.0, 0.42), toneMapped: false }),
      rail: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.9, 0.4), toneMapped: false }),
      bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.7, 1.5), toneMapped: false }),
      brass: new THREE.MeshBasicMaterial({ map: brass, color: new THREE.Color(0.72, 0.58, 0.44), side: THREE.DoubleSide }),
      stair: new THREE.MeshBasicMaterial({ map: marbleStair, color: new THREE.Color(2.6, 2.1, 1.7) }),
      riser: new THREE.MeshBasicMaterial({ color: '#120b07' }),
      nosing: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.66), toneMapped: false }),
      door: new THREE.MeshBasicMaterial({ map: doorWood, color: new THREE.Color(0.5, 0.3, 0.2) }),
      suit: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      shirt: new THREE.MeshBasicMaterial({ color: '#c9c2b4', side: THREE.DoubleSide }),
      tie: new THREE.MeshBasicMaterial({ color: '#7a0f1a', side: THREE.DoubleSide }),
      warmGlow: glowMat(new THREE.Color(1.0, 0.62, 0.36)),
      pool: glowMat(new THREE.Color(1.0, 0.5, 0.3)),
      goldGlow: glowMat(new THREE.Color(1.0, 0.72, 0.32)),
      spill: glowMat(new THREE.Color(1.0, 0.7, 0.3)),
      cone: coneMat()
    }
  }, [])
  const built = useMemo(() => {
    const root = new THREE.Group(), S = SHOP_Y, m = mats
    const add = (o: THREE.Object3D) => { root.add(o); return o }
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); return add(b)
    }
    const shopLen = DOOR_Z - WARD_Z, shopMid = (DOOR_Z + WARD_Z) / 2
    /* street + shop shell */
    add(new THREE.Mesh(quad([-6, S, DOOR_Z + 8], [6, S, DOOR_Z + 8], [6, S, DOOR_Z], [-6, S, DOOR_Z]), m.street))
    add(new THREE.Mesh(quad([-3.5, S, DOOR_Z], [3.5, S, DOOR_Z], [3.5, S, WARD_Z], [-3.5, S, WARD_Z], [2.4, 3.6]), m.floor))
    add(new THREE.Mesh(quad([-3.5, S + 4, WARD_Z], [3.5, S + 4, WARD_Z], [3.5, S + 4, DOOR_Z], [-3.5, S + 4, DOOR_Z]), m.dark))
    for (const sx of [-1, 1]) add(new THREE.Mesh(quad([3.5 * sx, S, DOOR_Z], [3.5 * sx, S, WARD_Z], [3.5 * sx, S + 4, WARD_Z], [3.5 * sx, S + 4, DOOR_Z], [3, 1]), m.wall))
    /* front wall with the doorway, neon frame and sign */
    add(new THREE.Mesh(quad([-6, S, DOOR_Z], [-1.1, S, DOOR_Z], [-1.1, S + 6, DOOR_Z], [-6, S + 6, DOOR_Z]), m.dark))
    add(new THREE.Mesh(quad([1.1, S, DOOR_Z], [6, S, DOOR_Z], [6, S + 6, DOOR_Z], [1.1, S + 6, DOOR_Z]), m.dark))
    add(new THREE.Mesh(quad([-1.1, S + 3, DOOR_Z], [1.1, S + 3, DOOR_Z], [1.1, S + 6, DOOR_Z], [-1.1, S + 6, DOOR_Z]), m.dark))
    box(0.04, 3.05, 0.04, -1.13, S + 1.52, DOOR_Z + 0.03, m.red); box(0.04, 3.05, 0.04, 1.13, S + 1.52, DOOR_Z + 0.03, m.red)
    box(2.3, 0.04, 0.04, 0, S + 3.05, DOOR_Z + 0.03, m.red); box(3.2, 0.07, 0.05, 0, S + 3.55, DOOR_Z + 0.05, m.red)
    /* neon runs along the ceiling line and the skirting */
    for (const sx of [-1, 1]) {
      box(0.03, 0.03, shopLen, 3.46 * sx, S + 3.85, shopMid, m.red)
      box(0.03, 0.03, shopLen, 3.46 * sx, S + 0.06, shopMid, m.redDim)
    }
    /* racks of suits both sides, angled to the aisle */
    const sg = suitGeo()
    let ci = 0
    for (const sx of [-1, 1]) {
      const x = 1.95 * sx, y = S + 2.15
      add(bar(new THREE.Vector3(x, y, 20.9), new THREE.Vector3(x, y, 13.6), 0.018, m.rail))
      add(bar(new THREE.Vector3(x, S, 20.9), new THREE.Vector3(x, y, 20.9), 0.016, m.rail))
      add(bar(new THREE.Vector3(x, S, 13.6), new THREE.Vector3(x, y, 13.6), 0.016, m.rail))
      for (let k = 0; k < 10; k++) {
        const z = 20.5 - k * 0.72, col = new THREE.Color(SUIT_COLOURS[(ci++ * 7) % SUIT_COLOURS.length])
        const grp = new THREE.Group(); grp.position.set(x - 0.02 * sx, y - 0.5, z); grp.rotation.y = -sx * 0.9
        const jk = new THREE.Mesh(sg.shade(sg.jacket.clone(), col), m.suit); grp.add(jk)
        const sh = new THREE.Mesh(sg.shirt, m.shirt); sh.position.z = 0.002; grp.add(sh)
        const ti = new THREE.Mesh(sg.tie, m.tie); ti.position.z = 0.004; grp.add(ti)
        const tr = new THREE.Mesh(sg.shade(new THREE.PlaneGeometry(0.42, 0.62).translate(0, -0.74, -0.01), col.clone().multiplyScalar(0.8)), m.suit); grp.add(tr)
        add(grp)
      }
    }
    /* pendant lights down the aisle */
    const lights: THREE.Mesh[] = []
    /* spotlights over the racks (the aisle itself stays clear, so the camera never walks through a light cone) */
    for (const z of [19.9, 17.3, 14.7]) for (const lx of [-1.95, 1.95]) {
      box(0.012, 0.5, 0.012, lx, S + 3.75, z, m.dark)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), m.bulb); bulb.position.set(lx, S + 3.45, z); add(bulb)
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.warmGlow); halo.position.set(lx, S + 3.45, z); halo.scale.set(1.0, 1.0, 1); add(halo); lights.push(halo)
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 1, 1, 32, 1, true), m.cone); cone.position.set(lx, S + 1.75, z); cone.scale.set(0.75, 3.4, 0.75); add(cone)
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.pool); pool.rotation.x = -Math.PI / 2; pool.position.set(lx, S + 0.01, z); pool.scale.set(1.8, 1.8, 1); add(pool)
    }
    /* a red runner down the aisle to the wardrobe */
    add(new THREE.Mesh(quad([-0.7, S + 0.006, DOOR_Z - 0.2], [0.7, S + 0.006, DOOR_Z - 0.2], [0.7, S + 0.006, WARD_Z + 0.9], [-0.7, S + 0.006, WARD_Z + 0.9]), m.runner))
    for (const sx of [-1, 1]) box(0.025, 0.006, DOOR_Z - WARD_Z - 1.1, 0.72 * sx, S + 0.008, (DOOR_Z - 0.2 + WARD_Z + 0.9) / 2, m.goldDim)
    /* end wall with the hidden wardrobe */
    const ow = 1.25, oh = 3.3
    add(new THREE.Mesh(quad([-3.5, S, WARD_Z], [-ow, S, WARD_Z], [-ow, S + 4, WARD_Z], [-3.5, S + 4, WARD_Z], [1.5, 1]), m.wall))
    add(new THREE.Mesh(quad([ow, S, WARD_Z], [3.5, S, WARD_Z], [3.5, S + 4, WARD_Z], [ow, S + 4, WARD_Z], [1.5, 1]), m.wall))
    add(new THREE.Mesh(quad([-ow, S + oh, WARD_Z], [ow, S + oh, WARD_Z], [ow, S + 4, WARD_Z], [-ow, S + 4, WARD_Z]), m.wall))
    box(0.14, oh + 0.2, 0.7, -ow - 0.07, S + (oh + 0.2) / 2, WARD_Z + 0.35, m.door)
    box(0.14, oh + 0.2, 0.7, ow + 0.07, S + (oh + 0.2) / 2, WARD_Z + 0.35, m.door)
    box(ow * 2 + 0.28, 0.24, 0.76, 0, S + oh + 0.12, WARD_Z + 0.36, m.door)
    box(ow * 2 + 0.3, 0.025, 0.02, 0, S + oh + 0.25, WARD_Z + 0.75, m.goldDim)
    const mkDoor = (side: number) => {
      const hinge = new THREE.Group(); hinge.position.set(-side * ow, S, WARD_Z + 0.7)
      const d = new THREE.Mesh(new THREE.BoxGeometry(ow, oh, 0.06), m.door); d.position.set(side * ow / 2, oh / 2, 0); hinge.add(d)
      const inset = new THREE.Mesh(new THREE.PlaneGeometry(ow - 0.24, oh - 0.4), m.goldDim); inset.position.set(side * ow / 2, oh / 2, 0.031); inset.scale.set(1, 1, 1)
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(ow - 0.28, oh - 0.44), m.door); frame.position.set(side * ow / 2, oh / 2, 0.033)
      hinge.add(inset); hinge.add(frame)
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.04), m.gold); handle.position.set(side * (ow - 0.12), oh * 0.48, 0.05); hinge.add(handle)
      add(hinge); return hinge
    }
    const wl = mkDoor(1), wr = mkDoor(-1)
    const wardGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.goldGlow); wardGlow.position.set(0, S + 1.6, WARD_Z - 0.6); wardGlow.scale.set(2.6, 3.4, 1); add(wardGlow)
    /* glass doors at the entrance */
    const mkGlass = (side: number) => {
      const hinge = new THREE.Group(); hinge.position.set(-side * 1.1, S, DOOR_Z)
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 2.96), m.glass); p.position.set(side * 0.55, 1.5, 0); hinge.add(p)
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.7, 0.03), m.rail); h.position.set(side * 0.98, 1.2, 0.02); hinge.add(h)
      add(hinge); return hinge
    }
    const gl = mkGlass(1), gr = mkGlass(-1)
    /* the stairwell: brass walls, marble steps with gold nosings, gold rails following the slope */
    const sw = 1.24, rise = S / STEPS, run = (WARD_Z - STAIR_END) / STEPS
    for (let k = 0; k < STEPS; k++) {
      const top = S - (k + 1) * rise, z0 = WARD_Z - k * run
      box(sw * 2, 0.04, run, 0, top - 0.02, z0 - run / 2, m.stair)
      box(sw * 2, rise, 0.03, 0, top - 0.04 - rise / 2, z0 - run + 0.015, m.riser)
      box(sw * 2, 0.03, 0.05, 0, top + 0.005, z0 - run + 0.025, m.nosing)
      for (const sx of [-1, 1]) box(0.02, 0.035, 0.12, sx * (sw - 0.015), top + 0.28, z0 - run / 2, m.gold)   // step lights
    }
    add(new THREE.Mesh(quad([-sw, 0, STAIR_END], [sw, 0, STAIR_END], [sw, 0, 0], [-sw, 0, 0], [1, 2]), m.stair))
    for (const sx of [-1, 1]) {
      add(new THREE.Mesh(quad([sw * sx, -0.2, WARD_Z], [sw * sx, -0.2, 0], [sw * sx, S + 4, 0], [sw * sx, S + 4, WARD_Z], [6, 3]), m.brass))
      const rail = (y: number, mat: THREE.Material) => {
        add(bar(new THREE.Vector3(sw * sx * 0.97, S + y, WARD_Z), new THREE.Vector3(sw * sx * 0.97, y, STAIR_END), 0.014, mat))
        add(bar(new THREE.Vector3(sw * sx * 0.97, y, STAIR_END), new THREE.Vector3(sw * sx * 0.97, y, 0), 0.014, mat))
      }
      rail(0.95, m.gold); rail(3.05, m.goldDim)
    }
    add(new THREE.Mesh(quad([-sw, S + 3.4, WARD_Z], [sw, S + 3.4, WARD_Z], [sw, 3.2, STAIR_END], [-sw, 3.2, STAIR_END]), m.dark))
    add(new THREE.Mesh(quad([-sw, 3.2, STAIR_END], [sw, 3.2, STAIR_END], [sw, 3.2, 0], [-sw, 3.2, 0]), m.dark))
    /* the vault's light spilling up the stairwell */
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.spill); spill.position.set(0, 1.4, -0.6); spill.scale.set(3.2, 3.2, 1); add(spill)
    return { root, gl, gr, wl, wr, lights, wardGlow, spill }
  }, [mats])
  useFrame(({ camera }) => {
    const t = walkTime()
    const on = t >= 0 && t < WALK_MS / 1000 + 0.3
    g.current!.visible = on
    if (!on) return
    const w = world()
    g.current!.position.set(camXAt(0, w), w.floorY, 0)
    const b = built
    const gOpen = easeInOut(clamp01((t - 0.05) / 1.1)) * 1.45
    b.gl.rotation.y = gOpen; b.gr.rotation.y = -gOpen
    const wOpen = easeInOut(clamp01((t - 3.0) / 1.25))
    b.wl.rotation.y = -wOpen * 1.75; b.wr.rotation.y = wOpen * 1.75
    /* glows fade as the camera reaches them, so we never fly through a sheet of light */
    const cz = camera.position.z
    mats.goldGlow.uniforms.uI.value = 0.13 * wOpen * smooth(1.6, 4.0, cz - (WARD_Z - 0.6))
    b.wardGlow.visible = mats.goldGlow.uniforms.uI.value > 0.002
    mats.spill.uniforms.uI.value = 0.14 * smooth(1.5, 5, cz + 0.6) * smooth(11.5, 8, cz)
    b.spill.visible = mats.spill.uniforms.uI.value > 0.002
    mats.warmGlow.uniforms.uI.value = 0.4 + 0.04 * Math.sin(t * 7.0)
    mats.pool.uniforms.uI.value = 0.12
    mats.cone.uniforms.uI.value = 0.55
    void low
  })
  /* compile the walk's shaders up front, so the first step through the doors doesn't hitch */
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    const id = window.setTimeout(() => {
      const grp = g.current; if (!grp) return
      grp.visible = true
      try { gl.compile(scene, camera) } catch { /* not fatal */ }
      grp.visible = false
    }, 1200)
    return () => clearTimeout(id)
  }, [gl, scene, camera])
  return <group ref={g} visible={false}><primitive object={built.root} /></group>
}

/* Fog + clear colour follow the walk: crimson in the shop, warming to gold down the stairs, the vault's own dark at the bottom */
function Atmosphere({ path }: { path: { current: WalkPath | null } }) {
  const { scene, gl } = useThree()
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const fog = scene.fog as THREE.Fog | null; if (!fog) return
    const t = walkTime(), walking = t >= 0 && t < WALK_MS / 1000
    if (!walking || !path.current) {
      if (fog.color.equals(walkFog.vault)) return
      fog.color.copy(walkFog.vault); fog.near = 9; fog.far = 30; gl.setClearColor(walkFog.vault); return
    }
    const p = path.current, u = p.dist(t) / p.total
    const k1 = smooth(0.36, 0.62, u), k2 = smooth(0.8, 1.0, u)
    c.copy(walkFog.shop).lerp(walkFog.gold, k1).lerp(walkFog.vault, k2)
    fog.color.copy(c); gl.setClearColor(c)
    fog.near = 5 + 4 * k2; fog.far = 22 + 8 * k2
  })
  return null
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
  const g = useRef<THREE.Group>(null), cone = useRef<THREE.Mesh>(null)
  const pool = useRef<THREE.Mesh>(null), wallPool = useRef<THREE.Mesh>(null)
  const cm = useMemo(() => coneMat(), [])
  const pm = useMemo(() => glowMat(new THREE.Color(1.0, 0.76, 0.4)), []), wm = useMemo(() => glowMat(new THREE.Color(0.95, 0.66, 0.3)), [])
  const plinth = useRef<THREE.Mesh>(null), ring = useRef<THREE.Mesh>(null), niche = useRef<THREE.Mesh>(null)
  const nm = useMemo(() => nicheMat(), [])
  const plMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.07, 0.055, 0.045) }), [])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.3), toneMapped: false }), [])
  const st = useRef({ a: 0, s: 0 })
  useFrame((_, dt) => {
    const s = st.current
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
    g.current!.position.set(i * w.spacing, 0, 0)
    const pr = w.pieceW * 0.4, ph = w.pieceH * 0.05
    plinth.current!.position.set(0, w.floorY + ph / 2, PZ + 0.05); plinth.current!.scale.set(pr, ph, pr * 0.55)
    ring.current!.position.set(0, w.floorY + ph + 0.004, PZ + 0.05); ring.current!.scale.set(pr, pr * 0.55, 1)
    const nW = w.pieceW * 1.16, nH = w.pieceH * 1.08
    niche.current!.position.set(0, w.py + w.pieceH * 0.02, PZ - 0.9); niche.current!.scale.set(nW, nH, 1)
    nm.uniforms.uAsp.value = nW / nH; nm.uniforms.uI.value = 0.35 + 0.9 * s.s
    ringMat.color.setRGB(0.5 + 3.0 * s.s, 0.34 + 2.0 * s.s, 0.12 + 0.6 * s.s)
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
      <mesh ref={plinth} material={plMat} renderOrder={3}><cylinderGeometry args={[1, 1.06, 1, 48]} /></mesh>
      <mesh ref={ring} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}><ringGeometry args={[0.94, 1, 64]} /></mesh>
    </group>
  )
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
/* GPU health: if the context is lost, frames come out black, or the scene crawls, hand over to the 2D room */
function Health({ onFail }: { onFail: (why: string) => void }) {
  const { gl } = useThree()
  const st = useRef({ lastCheck: 0, black: 0, slow: 0, good: 0, failed: false, px: new Uint8Array(4) })
  useEffect(() => {
    const c = gl.domElement
    const lost = (e: Event) => { e.preventDefault(); if (!st.current.failed) { st.current.failed = true; onFail('webgl context lost') } }
    c.addEventListener('webglcontextlost', lost)
    return () => c.removeEventListener('webglcontextlost', lost)
  }, [gl, onFail])
  useFrame(() => {
    const s = st.current, n = now()
    if (s.failed || n - s.lastCheck < 1000) return
    s.lastCheck = n
    const wt = walkTime(), settled = rig.view === 'wardrobe' && (wt < 0 || wt > WALK_MS / 1000 + 0.8) && (!rig.descentAt || n - rig.descentAt > DESCENT_MS + 800) && document.visibilityState === 'visible'
    if (!settled) return
    /* sample a few points on the brass wall (always lit in the vault) right after the composer has drawn */
    s.slow = rig.fps > 0 && rig.fps < 8 ? s.slow + 1 : 0
    if (s.slow >= 8 && !FORCE3D) { s.failed = true; onFail('too slow (' + rig.fps + ' fps)'); return }
    if (s.good >= 3) return   // the GPU draws fine; stop reading pixels back
    const ctx = gl.getContext(), W = ctx.drawingBufferWidth, H = ctx.drawingBufferHeight
    let max = 0
    for (const [fx, fy] of [[0.5, 0.8], [0.2, 0.7], [0.8, 0.7], [0.5, 0.55], [0.35, 0.9]]) {
      ctx.readPixels(Math.floor(W * fx), Math.floor(H * fy), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, s.px)
      max = Math.max(max, s.px[0], s.px[1], s.px[2])
    }
    s.black = max < 4 ? s.black + 1 : 0
    if (max >= 4) s.good++
    ;(window as any).__glHealth = { max, black: s.black, slow: s.slow, good: s.good }
    if (s.black >= 3) { s.failed = true; onFail('frames are black') }
  }, 2)
  return null
}
/* keep the DOM pictures on their 3D anchors: the rail's pitch and the camera's glide differ from the scroll track's */
function DomSync() {
  const last = useRef<number[]>([])
  useEffect(() => () => { document.querySelectorAll<HTMLElement>('.track .stage').forEach(el => { el.style.transform = '' }) }, [])
  useFrame(({ camera }) => {
    if (rig.view !== 'wardrobe') return
    const els = document.querySelectorAll<HTMLElement>('.track .stage'), w = world()
    const sp = (camera.position.x - w.camOffset) / w.spacing, pitch = w.spacing / w.unit, slideW = rig.layout.slideW
    const dy = camera.position.y / w.unit * 0.5
    els.forEach((el, i) => {
      /* only pieces near the camera move; translating far ones would widen the track's scroll area and feed back into the scroll */
      if (i >= LAST || Math.abs(i - sp) > 2.5) { if (last.current[i] !== 0) { el.style.transform = ''; last.current[i] = 0 } return }
      const tx = (i - sp) * pitch - (i - rig.scrollP) * slideW
      if (Math.abs(tx - (last.current[i] ?? 1e9)) > 0.05 || Math.abs(dy - (last.current[100] ?? 1e9)) > 0.05) {
        el.style.transform = `translate3d(${tx.toFixed(2)}px,${dy.toFixed(2)}px,0)`; last.current[i] = tx
      }
    })
    last.current[100] = dy
  })
  return null
}
/* depth of field: shallow during the walk, gentle in the vault (background brass softens behind the pieces) */
function Focus({ fx }: { fx: { current: DepthOfFieldEffect | null } }) {
  useFrame(() => {
    const e = fx.current; if (!e) return
    const wt = walkTime(), walking = wt >= 0 && wt < WALK_MS / 1000
    const want = walking ? 2.4 : rig.view === 'wardrobe' ? 1.1 : 0
    e.bokehScale += (want - e.bokehScale) * 0.08
    e.cocMaterial.focusDistance = walking ? 3.4 : D
    e.cocMaterial.focusRange = walking ? 3.2 : 3.0
  })
  return null
}

export default function Experience({ onFail, paused = false }: { onFail: (why: string) => void; paused?: boolean }) {
  const [low, setLow] = useState(false)
  const path = useRef<WalkPath | null>(null)
  const dof = useRef<DepthOfFieldEffect | null>(null)
  const [dpr, setDpr] = useState(Math.min(1.75, window.devicePixelRatio || 1))
  return (
    <Canvas className="gl" dpr={dpr} frameloop={paused ? 'demand' : 'always'} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 0, GATE_CAM] }}
      onCreated={({ gl, scene }) => { gl.setClearColor('#050303'); scene.fog = new THREE.Fog('#050303', 9, 30) }}
      aria-hidden="true">
      {!HQ && <PerformanceMonitor onDecline={() => { setDpr(1); setLow(true); rig.low = true }} flipflops={2} onFallback={() => { setDpr(1); setLow(true); rig.low = true }} />}
      <ambientLight intensity={1.2} />
      <CameraRig path={path} />
      <Atmosphere path={path} />
      <Room low={low} />
      {ITEMS.map((_, i) => <Piece key={i} i={i} />)}
      <Walk low={low} />
      <Dust />
      <Storefront />
      <Gate />
      <ScreenFX />
      <Stats />
      <Health onFail={onFail} />
      <DomSync />
      {!low && <Focus fx={dof} />}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        {!low ? <DepthOfField ref={dof} focusDistance={D} focusRange={3} bokehScale={0} resolutionScale={0.5} /> : <></>}
        <Bloom mipmapBlur intensity={low ? 0.8 : 1.15} luminanceThreshold={0.95} luminanceSmoothing={0.2} radius={0.75} />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.22} />
        <Vignette offset={0.28} darkness={0.82} />
      </EffectComposer>
    </Canvas>
  )
}
