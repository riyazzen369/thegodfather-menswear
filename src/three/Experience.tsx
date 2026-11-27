import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { MeshReflectorMaterial, PerformanceMonitor } from '@react-three/drei'
import { EffectComposer, Bloom, Noise, Vignette, DepthOfField } from '@react-three/postprocessing'
import { BlendFunction, type DepthOfFieldEffect } from 'postprocessing'
import * as THREE from 'three'
import { ITEMS, STORE, TAILOR, vaultCount, vaultSrc, onCatalogue } from '../data'
import { photoUrl } from '../Pic'
import { clearOrbitCopy } from '../rig'
import { rig, easeInOut, easeOut, clamp01, smooth, WALK_MS, walkTime, orbitAt, orbitFade, applyOrbit } from '../rig'

/* ---------------- world constants ---------------- */
const FOV = 40
const PZ = -10          // plane of the pieces
const D = 6             // camera distance to the pieces
const CAM_W = PZ + D    // camera z in the wardrobe
const GATE_Z = 8        // logo doors
const GATE_CAM = 12     // camera z at the gate
const TAN = Math.tan((FOV / 2) * Math.PI / 180)
let LAST = vaultCount()
onCatalogue(() => { LAST = vaultCount() })

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
const HQ = QS.has('hq') || QS.get('q') != null            // debug: never drop quality
/* ?q=low|med|high pins a quality tier (see TIER below; otherwise auto, starting at med)
   low:  dpr 1, plain marble floor, no depth of field
   med:  dpr up to 1.25, reflective floor at reduced resolution, no depth of field
   high: dpr up to 1.75, full reflections, depth of field */
const Q = (['low', 'med', 'high'] as const).find(q => q === QS.get('q')) ?? null
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
/* ---- the palace wardrobe gate: carved honey-wood leaves with gilded relief, a gilded architrave, white marble ---- */
function goldGrad(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  gr.addColorStop(0, '#fff1b8'); gr.addColorStop(0.35, '#e8b852'); gr.addColorStop(0.7, '#b07a22'); gr.addColorStop(1, '#6e4612')
  return gr
}
/* draw a shape twice: a dark offset (the carved shadow) and the gilt on top, so it reads as relief */
function relief(g: CanvasRenderingContext2D, draw: () => void, fill: string | CanvasGradient, lw = 0) {
  g.save(); g.translate(2.5, 3); g.fillStyle = 'rgba(60,34,8,.55)'; g.strokeStyle = 'rgba(60,34,8,.55)'; draw(); if (lw) { g.lineWidth = lw; g.stroke() } else g.fill(); g.restore()
  g.fillStyle = fill; g.strokeStyle = fill; draw(); if (lw) { g.lineWidth = lw; g.stroke() } else g.fill()
}
function rosette(g: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  relief(g, () => { g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2) }, goldGrad(g, cx - R, cy - R, cx + R, cy + R), 7)
  relief(g, () => { g.beginPath(); g.arc(cx, cy, R * 0.86, 0, Math.PI * 2) }, goldGrad(g, cx - R, cy - R, cx + R, cy + R), 2.5)
  /* sunburst rays */
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2, r0 = R * 0.5, r1 = R * (k % 2 ? 0.74 : 0.82)
    relief(g, () => { g.beginPath(); g.moveTo(cx + Math.cos(a - 0.03) * r0, cy + Math.sin(a - 0.03) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a + 0.03) * r0, cy + Math.sin(a + 0.03) * r0); g.closePath() }, goldGrad(g, cx - R, cy - R, cx + R, cy + R))
  }
  /* two rings of petals */
  for (const [n, rr, len, wid] of [[16, 0.36, 0.17, 0.07], [12, 0.2, 0.12, 0.06]] as const) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (n === 12 ? 0.13 : 0)
      relief(g, () => { g.beginPath(); g.ellipse(cx + Math.cos(a) * R * rr, cy + Math.sin(a) * R * rr, R * len, R * wid, a, 0, Math.PI * 2) }, goldGrad(g, cx - R * 0.5, cy - R * 0.5, cx + R * 0.5, cy + R * 0.5))
    }
  }
  relief(g, () => { g.beginPath(); g.arc(cx, cy, R * 0.1, 0, Math.PI * 2) }, '#fff0b0')
}
/* a scroll-and-acanthus frieze, mirrored about its centre */
function frieze(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const cx = x + w / 2, cy = y + h / 2, gr = goldGrad(g, x, y, x + w, y + h)
  for (const s of [-1, 1]) {
    relief(g, () => {
      g.beginPath(); g.moveTo(cx + s * h * 0.25, cy)
      g.bezierCurveTo(cx + s * w * 0.18, cy - h * 0.55, cx + s * w * 0.3, cy + h * 0.45, cx + s * w * 0.42, cy - h * 0.05)
      g.arc(cx + s * w * 0.42 - s * h * 0.12, cy - h * 0.05, h * 0.12, 0, Math.PI * 1.6, s < 0)
    }, gr, 4.5)
    for (let k = 0; k < 5; k++) {
      const u = 0.1 + k * 0.075, lx = cx + s * w * u, ly = cy + (k % 2 ? 1 : -1) * h * 0.2
      relief(g, () => { g.beginPath(); g.ellipse(lx, ly, h * 0.16, h * 0.07, s * (k % 2 ? 0.7 : -0.7), 0, Math.PI * 2) }, gr)
    }
  }
  rosette(g, cx, cy, h * 0.3)
}
function raisedPanel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  /* bevel: light from the top left, shade to the bottom right */
  const b = 14
  g.fillStyle = 'rgba(255,226,160,.28)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - b, y + b); g.lineTo(x + b, y + b); g.lineTo(x + b, y + h - b); g.lineTo(x, y + h); g.fill()
  g.fillStyle = 'rgba(70,38,10,.42)'; g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.lineTo(x + b, y + h - b); g.lineTo(x + w - b, y + h - b); g.lineTo(x + w - b, y + b); g.fill()
  relief(g, () => { g.beginPath(); g.rect(x + b + 6, y + b + 6, w - 2 * b - 12, h - 2 * b - 12) }, goldGrad(g, x, y, x + w, y + h), 4)
}
function woodBase(g: CanvasRenderingContext2D, W: number, H: number) {
  const gr = g.createLinearGradient(0, 0, W, 0)
  gr.addColorStop(0, '#9c6428'); gr.addColorStop(0.5, '#cf9447'); gr.addColorStop(1, '#a86d2e')
  g.fillStyle = gr; g.fillRect(0, 0, W, H)
  for (let i = 0; i < 140; i++) {
    g.strokeStyle = `rgba(${90 + Math.random() * 60},${50 + Math.random() * 30},${15 + Math.random() * 15},${0.05 + Math.random() * 0.1})`
    g.lineWidth = 0.6 + Math.random() * 2
    let x = Math.random() * W; g.beginPath(); g.moveTo(x, 0)
    for (let y = 0; y <= H; y += 40) { x += Math.sin(y * 0.01 + i) * 2 + (Math.random() - 0.5) * 2; g.lineTo(x, y) }
    g.stroke()
  }
}
function carvedLeafTexture() {
  const W = 512, H = 1130, c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  woodBase(g, W, H)
  const m = 42, iw = W - 2 * m
  let y = 40
  const rows: [number, 'frieze' | 'square' | 'tall'][] = [[120, 'frieze'], [iw, 'square'], [120, 'frieze'], [H - 40 - 40 - 120 - iw - 120 - 3 * 28, 'tall']]
  for (const [h, kind] of rows) {
    raisedPanel(g, m, y, iw, h)
    if (kind === 'frieze') frieze(g, m + 26, y + 24, iw - 52, h - 48)
    else if (kind === 'square') { rosette(g, W / 2, y + h / 2, iw * 0.36); for (const [qx, qy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) rosette(g, W / 2 + qx * iw * 0.39, y + h / 2 + qy * iw * 0.39, 16) }
    else { relief(g, () => { g.beginPath(); g.ellipse(W / 2, y + h / 2, iw * 0.3, h * 0.36, 0, 0, Math.PI * 2) }, goldGrad(g, m, y, m + iw, y + h), 4); rosette(g, W / 2, y + h / 2, iw * 0.14) }
    y += h + 28
  }
  /* gilded edge beads */
  g.fillStyle = goldGrad(g, 0, 0, 20, H); g.fillRect(0, 0, 8, H); g.fillRect(W - 8, 0, 8, H)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
/* gilded carved moulding (bead + egg-and-dart), drawn along the texture's long side */
function architraveTexture(horizontal: boolean) {
  const L = 1024, S = 128, c = document.createElement('canvas'); c.width = horizontal ? L : S; c.height = horizontal ? S : L
  const g = c.getContext('2d')!
  g.save(); if (horizontal) { g.translate(L, 0); g.rotate(Math.PI / 2) }
  g.fillStyle = goldGrad(g, 0, 0, S, 0); g.fillRect(0, 0, S, L)
  g.fillStyle = 'rgba(80,46,10,.5)'; g.fillRect(36, 0, 3, L); g.fillRect(92, 0, 3, L)
  for (let y = 0; y < L; y += 32) {
    relief(g, () => { g.beginPath(); g.ellipse(64, y + 16, 18, 13, 0, 0, Math.PI * 2) }, goldGrad(g, 40, y, 90, y + 32))
    relief(g, () => { g.beginPath(); g.arc(18, y + 16, 7, 0, Math.PI * 2) }, '#f5d27a')
    relief(g, () => { g.beginPath(); g.arc(110, y + 16, 7, 0, Math.PI * 2) }, '#f5d27a')
  }
  g.restore()
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
/* white and cream marble with soft grey veining */
function whiteMarbleTexture() {
  const N = 1024, c = document.createElement('canvas'); c.width = N; c.height = N
  const g = c.getContext('2d')!
  g.fillStyle = '#ece5d8'; g.fillRect(0, 0, N, N)
  for (let i = 0; i < 70; i++) { const r = 60 + Math.random() * 220; const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, Math.random() < 0.5 ? 'rgba(255,252,244,.35)' : 'rgba(214,204,188,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(Math.random() * N, Math.random() * N); g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore() }
  g.filter = 'blur(1.5px)'
  for (let k = 0; k < 18; k++) {
    g.strokeStyle = `rgba(${120 + Math.random() * 30},${118 + Math.random() * 30},${118 + Math.random() * 30},${0.12 + Math.random() * 0.22})`
    g.lineWidth = 0.8 + Math.random() * 2.6
    let x = Math.random() * N, y = -20; g.beginPath(); g.moveTo(x, y)
    const dx = (Math.random() - 0.5) * 3
    while (y < N + 20) { x += dx * 12 + (Math.random() - 0.5) * 34; y += 14 + Math.random() * 26; g.lineTo(x, y) }
    g.stroke()
  }
  g.filter = 'none'
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
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
    /* move the rail first, so camera, niches and DOM pictures all use this frame's position */
    if (rig.railStep) { const n = now(); rig.glStepAt = n; rig.railStep(n) }
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
      const c = cur.current, a = 1 - Math.exp(-dt * 24)   /* the rail is already smooth; the camera only follows it closely */
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
  const { gl } = useThree()
  useEffect(() => { const id = setTimeout(() => loadTex(STORE(window.innerWidth), t => { gl.initTexture(t); setTex(t) }), 300); return () => clearTimeout(id) }, [gl])
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
type WalkPath = { curve: THREE.CatmullRomCurve3; total: number; dist: (t: number) => number; lead: (t: number) => number; key: number }
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
  /* Lorenzo walks a couple of metres ahead; the camera follows at a walking pace, slows at the foot of the stairs,
     and stops short of the golden wardrobe while he unlocks it, then glides onto the first anchor */
  const dist = spline([[0, 0], [0.65, at(1) * 0.7], [1.4, at(3)], [1.9, at(4) + 0.4], [2.2, at(5)], [2.8, at(7)], [3.35, total - 1.7], [4.85, total - 1.25], [WALK_MS / 1000, total]])
  /* how far ahead of the camera he is (along the same path, then on past its end to the wardrobe) */
  const lead = spline([[0, 1.3], [0.55, 2.2], [1.0, 2.5], [2.8, 2.5], [3.4, 5.3]])
  return { curve, total, dist, lead, key: endY }
}
/* Lorenzo, seen from behind with the cat in his arm: a keyed, generated walk cycle (24 frames, 2 steps) in one atlas,
   plus a 25th frame raising the key. Frames are picked by distance walked so his feet don't slide, and blended for smoothness.
   He is lit by the room he is in: crimson in the shop, gold on the stairs, rim-lit by the wardrobe when it opens. */
const LEAD = { cols: 5, rows: 5, n: 24, key: 24, aspect: 240 / 460, h: 1.86, stride: 1.5 }
const SPRITE_VS = `varying vec2 vUv;
#include <fog_pars_vertex>
void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`
const SPRITE_FS = `uniform sampler2D map; uniform vec2 uCell, uA, uB; uniform float uMix, uO, uRimI; uniform vec3 uTint, uRim; varying vec2 vUv;
#include <fog_pars_fragment>
vec4 at(vec2 o){ return texture2D(map, o + clamp(vUv, 0.003, 0.997) * uCell); }
float al(vec2 o, vec2 d){ return texture2D(map, o + clamp(vUv + d, 0.003, 0.997) * uCell).a; }
void main(){
  vec4 a = at(uA), b = at(uB); vec4 c = mix(a, b, uMix);
  if (c.a < 0.04) discard;
  vec2 d = vec2(0.014, 0.007);
  float e = c.a - min(min(al(uA, vec2(d.x, 0.)), al(uA, vec2(-d.x, 0.))), min(al(uA, vec2(0., d.y)), al(uA, vec2(0., -d.y))));
  vec3 col = c.rgb * uTint + uRim * uRimI * clamp(e * 1.2, 0.0, 1.0);
  gl_FragColor = vec4(col, c.a * uO);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`
function leadMat(onLoad: (t: THREE.Texture) => void) {
  const tex = new THREE.TextureLoader().load(TAILOR.walk, onLoad)
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uCell: { value: new THREE.Vector2(1 / LEAD.cols, 1 / LEAD.rows) }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() },
    uMix: { value: 0 }, uO: { value: 1 }, uRimI: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uRim: { value: new THREE.Color(1, 0.7, 0.35) }
  }])
  u.map = { value: tex }
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS, transparent: true, depthWrite: false, fog: true })
}
const cellOff = (i: number, v: THREE.Vector2) => v.set((i % LEAD.cols) / LEAD.cols, 1 - (Math.floor(i / LEAD.cols) + 1) / LEAD.rows)
/* floor height in the walk's local frame: shop, stair slope, vault */
const floorAt = (z: number) => z >= WARD_Z ? SHOP_Y : z <= STAIR_END ? 0 : SHOP_Y * (z - STAIR_END) / (WARD_Z - STAIR_END) - SHOP_Y / STEPS * 0.5
/* the golden wardrobe in the vault: where he stops, when it unlocks and opens */
const VAULT_DOOR_Z = -8.4, STOP_PAST = 3.55, KEY_AT = 3.5, OPEN_AT = 4.15, OPEN_S = 1.25, INTO_LIGHT = 4.8
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

function Walk({ low, path }: { low: boolean; path: { current: WalkPath | null } }) {
  const g = useRef<THREE.Group>(null)
  const ready = useRef<((t: THREE.Texture) => void) | null>(null)
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
      cone: coneMat(),
      vaultGold: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.4, 0.18) }),
      leaf: new THREE.MeshBasicMaterial({ map: carvedLeafTexture(), color: new THREE.Color(1.06, 0.98, 0.9) }),
      archV: new THREE.MeshBasicMaterial({ map: architraveTexture(false), color: new THREE.Color(1.0, 0.92, 0.8) }),
      archH: new THREE.MeshBasicMaterial({ map: architraveTexture(true), color: new THREE.Color(1.0, 0.92, 0.8) }),
      marbleW: new THREE.MeshBasicMaterial({ map: (() => { const t = whiteMarbleTexture(); t.repeat.set(3, 1.4); return t })(), color: new THREE.Color(1.02, 0.99, 0.93) }),
      trim: new THREE.MeshBasicMaterial({ map: (() => { const t = whiteMarbleTexture(); t.repeat.set(0.3, 1); return t })(), color: new THREE.Color(1.1, 1.07, 1.0) }),
      trimShade: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.52, 0.47) }),
      seam: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 0.9), toneMapped: false, transparent: true, opacity: 0 }),
      flood: glowMat(new THREE.Color(1.0, 0.74, 0.34)),
      glint: glowMat(new THREE.Color(1.0, 0.85, 0.5)),
      shadow: new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uO: { value: 0.5 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uO; varying vec2 vUv; void main(){ float r = length((vUv - 0.5) * 2.0); gl_FragColor = vec4(0.0, 0.0, 0.0, uO * pow(1.0 - smoothstep(0.0, 1.0, r), 1.6)); }` }),
      lead: leadMat(t => ready.current?.(t))
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
    /* the wardrobe gate that closes off the vault: a palace doorway. Two tall carved honey-wood leaves with gilded relief
       (rosette medallion, scroll friezes), a gilded architrave, white classical trim, set in a white marble wall */
    const VW = 2.15, VH = 5.2, VZ = VAULT_DOOR_Z
    const flood = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.flood); flood.position.set(0, 2.4, VZ - 2.5); flood.scale.set(10, 8.5, 1); add(flood)
    const mkVault = (side: number) => {
      const hinge = new THREE.Group(); hinge.position.set(-side * VW, 0, VZ)
      /* faces: +x -x +y -y +z(front) -z(back) */
      const d = new THREE.Mesh(new THREE.BoxGeometry(VW, VH, 0.14), [m.vaultGold, m.vaultGold, m.vaultGold, m.vaultGold, m.leaf, m.leaf]); d.position.set(side * VW / 2, VH / 2, 0); hinge.add(d)
      /* gilded lever handles near the meeting stiles, at the height of his gloved hand */
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.06), m.gold); h.position.set(side * (VW - 0.2), 1.05, 0.11); hinge.add(h)
      const hp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.02), m.goldDim); hp.position.set(side * (VW - 0.2), 1.05, 0.08); hinge.add(hp)
      add(hinge); return hinge
    }
    const vl = mkVault(1), vr = mkVault(-1)
    /* gilded architrave */
    const AW = 0.34
    box(VW * 2 + AW * 2, AW, 0.24, 0, VH + AW / 2, VZ + 0.04, m.archH)
    for (const sx of [-1, 1]) box(AW, VH + AW, 0.24, sx * (VW + AW / 2), (VH + AW) / 2, VZ + 0.04, m.archV)
    /* white classical trim: pilasters, a cornice with a shadow line and a plinth course */
    const PW = 0.5, X0 = VW + AW + 0.12
    for (const sx of [-1, 1]) {
      box(PW, VH + 0.9, 0.3, sx * (X0 + PW / 2), (VH + 0.9) / 2, VZ + 0.06, m.trim)
      box(PW + 0.16, 0.22, 0.36, sx * (X0 + PW / 2), 0.11, VZ + 0.08, m.trim)
      box(PW + 0.12, 0.16, 0.34, sx * (X0 + PW / 2), VH + 0.98, VZ + 0.07, m.trim)
    }
    const CW = (X0 + PW) * 2 + 0.5
    box(CW, 0.36, 0.5, 0, VH + 1.24, VZ + 0.12, m.trim); box(CW - 0.1, 0.05, 0.46, 0, VH + 1.04, VZ + 0.12, m.trimShade); box(CW + 0.2, 0.12, 0.6, 0, VH + 1.48, VZ + 0.14, m.trim)
    /* the marble wall around it (left, right, above), so the doorway is the only way through */
    const WW = 16, WH = 12, hx = VW + AW
    add(new THREE.Mesh(quad([-WW, -0.3, VZ - 0.02], [-hx, -0.3, VZ - 0.02], [-hx, WH, VZ - 0.02], [-WW, WH, VZ - 0.02], [3, 2.2]), m.marbleW))
    add(new THREE.Mesh(quad([hx, -0.3, VZ - 0.02], [WW, -0.3, VZ - 0.02], [WW, WH, VZ - 0.02], [hx, WH, VZ - 0.02], [3, 2.2]), m.marbleW))
    add(new THREE.Mesh(quad([-hx, VH + AW, VZ - 0.02], [hx, VH + AW, VZ - 0.02], [hx, WH, VZ - 0.02], [-hx, WH, VZ - 0.02], [0.8, 1.2]), m.marbleW))
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.03, VH - 0.1), m.seam); seam.position.set(0, VH / 2, VZ + 0.08); add(seam)
    /* the lock rides on the left door, by the handle */
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.05), m.gold); lock.position.set(VW - 0.07, 1.32, 0.1); vl.add(lock)
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.glint); glint.position.set(-0.07, 1.1, VZ + 0.22); glint.scale.set(0.6, 0.6, 1); add(glint)
    /* Lorenzo + a soft contact shadow */
    const geo = new THREE.PlaneGeometry(LEAD.h * LEAD.aspect, LEAD.h); geo.translate(0, LEAD.h / 2, 0)
    const lead = new THREE.Mesh(geo, m.lead); lead.renderOrder = 5; lead.frustumCulled = false; add(lead)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), m.shadow); shadow.rotation.x = -Math.PI / 2; add(shadow)
    return { root, gl, gr, wl, wr, lights, wardGlow, spill, vl, vr, flood, seam, lock, glint, lead, shadow }
  }, [mats])
  useFrame(({ camera }) => {
    const t = walkTime()
    const on = t >= 0 && t < WALK_MS / 1000 + 0.3
    g.current!.visible = on
    if (!on) return
    const w = world()
    g.current!.position.set(camXAt(0, w), w.floorY, 0)
    const b = built
    const gOpen = easeInOut(clamp01(t / 0.95)) * 1.45
    b.gl.rotation.y = gOpen; b.gr.rotation.y = -gOpen
    /* the hidden wardrobe swings open as he reaches it */
    const wOpen = easeInOut(clamp01((t - 0.7) / 0.75))
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
    /* the golden wardrobe: a key, a click of light at the lock, light through the seam, the doors open, gold floods out */
    const vOpen = easeInOut(clamp01((t - OPEN_AT) / OPEN_S))
    /* they swing inward, away from him, into the vault */
    b.vl.rotation.y = vOpen * 1.6; b.vr.rotation.y = -vOpen * 1.6
    const turn = smooth(KEY_AT + 0.35, KEY_AT + 0.6, t) * (1 - smooth(KEY_AT + 0.75, OPEN_AT + 0.2, t))
    mats.glint.uniforms.uI.value = 0.9 * turn; b.glint.visible = turn > 0.002
    mats.seam.opacity = smooth(KEY_AT + 0.45, OPEN_AT, t) * (1 - smooth(0, 0.2, vOpen)); b.seam.visible = mats.seam.opacity > 0.01
    const flood = smooth(OPEN_AT - 0.1, OPEN_AT + 0.55, t) * (1 - 0.7 * smooth(OPEN_AT + 0.7, WALK_MS / 1000, t))
    mats.flood.uniforms.uI.value = 0.55 * flood; b.flood.visible = flood > 0.002
    leader(t, camera)
    void low
  })
  /* where Lorenzo is and which frame he shows */
  const lv = useMemo(() => ({ p: new THREE.Vector3(), c: new THREE.Vector3(), e: new THREE.Vector3(), tint: new THREE.Color(), shop: new THREE.Color(0.78, 0.5, 0.5), stair: new THREE.Color(0.85, 0.7, 0.52), vault: new THREE.Color(0.78, 0.68, 0.56), gold: new THREE.Color(1.0, 0.72, 0.36) }), [])
  const leader = (t: number, camera: THREE.Camera) => {
    const P = path.current, b = built, m = mats.lead.uniforms
    if (!P) { b.lead.visible = false; b.shadow.visible = false; return }
    const stop = P.total + STOP_PAST
    /* after the doors open he walks on into the light */
    const on = smooth(INTO_LIGHT, WALK_MS / 1000 - 0.3, t)
    let s = Math.min(P.dist(t) + P.lead(t), stop) + on * 1.7
    if (s <= P.total) P.curve.getPointAt(clamp01(s / P.total), lv.p)
    else { P.curve.getPointAt(1, lv.p); lv.p.z -= s - P.total }
    /* step aside to the left of the seam to work the lock */
    const aside = smooth(P.total + 0.8, stop, s) * (1 - on)
    const x = lv.p.x - 0.34 * aside, z = lv.p.z, y = floorAt(z)
    b.lead.position.set(x, y, z); b.shadow.position.set(x + 0.05, y + 0.012, z + 0.06)
    /* face the camera (around y only) */
    lv.c.copy(camera.position).sub(g.current!.position)
    b.lead.rotation.y = Math.atan2(lv.c.x - x, lv.c.z - z)
    /* frames by distance walked; the key frame while he stands at the lock */
    const ph = (s / LEAD.stride) * LEAD.n, f0 = Math.floor(ph), fr = ph - f0
    const keyed = smooth(stop - 0.25, stop, Math.min(P.dist(t) + P.lead(t), stop)) * (1 - smooth(INTO_LIGHT - 0.15, INTO_LIGHT + 0.2, t))
    /* once he has stopped at the doors, both blend slots hold the doorman pose (no ghost of the stride in the rim) */
    cellOff(keyed > 0.6 ? LEAD.key : ((f0 % LEAD.n) + LEAD.n) % LEAD.n, m.uA.value)
    if (keyed > 0.001) { cellOff(LEAD.key, m.uB.value); m.uMix.value = keyed }
    else { cellOff((((f0 + 1) % LEAD.n) + LEAD.n) % LEAD.n, m.uB.value); m.uMix.value = fr }
    /* matched lighting: crimson shop, warm stairwell, near-silhouette in the vault, gold rim when the wardrobe opens */
    const stair = smooth(WARD_Z + 0.5, WARD_Z - 2.5, z), vault = smooth(STAIR_END + 1, STAIR_END - 2, z)
    lv.tint.copy(lv.shop).lerp(lv.stair, stair).lerp(lv.vault, vault)
    m.uTint.value.copy(lv.tint)
    const open = smooth(OPEN_AT - 0.1, OPEN_AT + 0.6, t)
    m.uRimI.value = 0.18 + 0.16 * stair + 0.4 * open + 0.2 * mats.seam.opacity
    m.uRim.value.setRGB(1.0, 0.3, 0.28).lerp(lv.gold, Math.max(stair, open))
    /* fade in from the doorway (never pops in front of the lens), out into the light at the end */
    const near = smooth(0.7, 1.3, lv.c.set(x, y + 1.5, z).distanceTo(lv.e.copy(camera.position).sub(g.current!.position)))
    m.uO.value = near * (1 - smooth(INTO_LIGHT + 0.35, WALK_MS / 1000 - 0.35, t))
    b.lead.visible = m.uO.value > 0.01
    mats.shadow.uniforms.uO.value = 0.55 * m.uO.value * (1 - open * 0.5); b.shadow.visible = b.lead.visible
  }
  /* compile every shader up front (entry, walk, vault), so no scene hitches the first time it appears */
  const { gl, scene, camera } = useThree()
  useEffect(() => { ready.current = t => { try { gl.initTexture(t) } catch { /* uploaded on first use */ } }; const t = mats.lead.uniforms.map.value as THREE.Texture; if (t.image) ready.current(t) }, [gl, mats])
  useEffect(() => {
    const id = window.setTimeout(() => {
      const grp = g.current; if (!grp) return
      /* everything, including the storefront and curtains that are hidden at the gate */
      const hidden: THREE.Object3D[] = []
      scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true } })
      /* upload the walk's textures now too (marble, brass, wood), not on the first frame of the walk */
      /* one texture per timer tick, not all in one go: a single burst of uploads froze the storefront intro for a moment */
      const texs = new Set<THREE.Texture>()
      grp.traverse(o => { const mt = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (mt && 'map' in mt && mt.map) texs.add(mt.map) })
      let ti = 0; const up = [...texs]
      const next = () => { if (ti >= up.length) return; try { gl.initTexture(up[ti++]) } catch { /* later */ } window.setTimeout(next, 70) }
      window.setTimeout(next, 200)
      /* async where the driver supports parallel compile, so the gate's glow never stalls while it happens */
      const restore = () => hidden.forEach(o => { o.visible = false })
      try {
        const r = (gl as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> }).compileAsync
        if (r) { const p = r.call(gl, scene, camera); restore(); p.catch(() => {}) } else { gl.compile(scene, camera); restore() }
      } catch { restore() }
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
function Room({ low, res }: { low: boolean; res: number }) {
  const wood = useMemo(() => brassTexture(), [])
  const marble = useMemo(() => marbleTexture(), [])
  const wallMat = useMemo(() => new THREE.MeshBasicMaterial({ map: wood, color: new THREE.Color(0.85, 0.74, 0.6) }), [wood])
  const stripMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 2.3, 0.8), toneMapped: false }), [])
  const endL = useMemo(() => velvetMat(), []), endR = useMemo(() => velvetMat(), [])
  const g = useRef<THREE.Group>(null)
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
  return (
    <group ref={g}>
      <mesh material={wallMat}><planeGeometry /></mesh>
      <mesh material={stripMat}><planeGeometry /></mesh>
      <mesh material={stripMat}><planeGeometry /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry />
        {low || !res
          ? <meshBasicMaterial map={marble} color="#8a7a70" />
          : <MeshReflectorMaterial resolution={res} mirror={0.7} blur={[280, 90]} mixBlur={1} mixStrength={3.4} depthScale={1.1}
              minDepthThreshold={0.4} maxDepthThreshold={1.4} roughness={0.85} metalness={0.5} color="#2a2420" map={marble} />}
      </mesh>
      <mesh material={endL}><planeGeometry /></mesh>
      <mesh material={endR}><planeGeometry /></mesh>
    </group>
  )
}

/* soft edge fade of a wardrobe photo (the same feather the DOM picture has), as an alpha map */
let edgeTex: THREE.CanvasTexture | null = null
function edgeMask() {
  if (edgeTex) return edgeTex
  const c = document.createElement('canvas'); c.width = c.height = 64
  const x = c.getContext('2d')!, d = x.createImageData(64, 64), ss = (a: number, b: number, t: number) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u) }
  for (let j = 0; j < 64; j++) for (let k = 0; k < 64; k++) {
    const u = (k + 0.5) / 64, v = (j + 0.5) / 64
    const m = ss(0, 0.2, u) * ss(0, 0.2, 1 - u) * ss(0, 0.11, v) * ss(0, 0.11, 1 - v), o = (j * 64 + k) * 4
    d.data[o] = d.data[o + 1] = d.data[o + 2] = Math.round(m * 255); d.data[o + 3] = 255
  }
  x.putImageData(d, 0, 0); edgeTex = new THREE.CanvasTexture(c); return edgeTex
}
/* Admin cut-outs come in every framing (small full-body, cropped torso, off-centre). Find the subject's box in the alpha channel and redraw it
   so every piece fills the golden arch the same way: centred, head just under the arch top, standing on the plinth, never wider than the arch.
   Opaque plated photos (the shipped ones) have no alpha, so they are left exactly as they are. Returns null when nothing should change. */
const FIT = { h: 0.80, bottom: 0.935, maxW: 0.72 }   // fractions of the photo plane, measured on screen: the arch runs v 0.09-0.95 and is 0.89 as wide as the plane
function fitSubject(im: HTMLImageElement | ImageBitmap): HTMLCanvasElement | null {
  const PW = 96, PH = 128, pc = document.createElement('canvas'); pc.width = PW; pc.height = PH
  const px = pc.getContext('2d', { willReadFrequently: true }); if (!px) return null
  px.drawImage(im, 0, 0, PW, PH)
  const d = px.getImageData(0, 0, PW, PH).data
  let x0 = PW, x1 = -1, y0 = PH, y1 = -1, soft = 0
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const a = d[(y * PW + x) * 4 + 3]
    if (a < 250) soft++
    if (a > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0 || soft < PW * PH * 0.04) return null                    // opaque photo, or empty: leave it
  const bw = (x1 - x0 + 1) / PW, bh = (y1 - y0 + 1) / PH
  if (bw < 0.12 || bh < 0.12) return null
  const k = Math.max(0.5, Math.min(2.4, Math.min(FIT.h / bh, FIT.maxW / bw)))
  const W = Math.min(768, (im as HTMLImageElement).width || 768), H = Math.round(W * 4 / 3)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d'); if (!x) return null
  const cx = ((x0 + x1 + 1) / 2 / PW) * (im as HTMLImageElement).width, bottom = ((y1 + 1) / PH) * (im as HTMLImageElement).height
  const sc = k * (W / (im as HTMLImageElement).width)
  x.drawImage(im, 0, 0, (im as HTMLImageElement).width, (im as HTMLImageElement).height, W / 2 - cx * sc, FIT.bottom * H - bottom * sc, (im as HTMLImageElement).width * sc, (im as HTMLImageElement).height * sc)
  return c
}
const photoLoader = (() => { const l = new THREE.TextureLoader(); l.setCrossOrigin('anonymous'); return l })()

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
  const cam = useThree(t => t.camera), gl = useThree(t => t.gl)
  /* the product photo itself, drawn in the 3D scene on the same ring as its niche */
  const photo = useRef<THREE.Mesh>(null)
  const pmat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, opacity: 0, alphaMap: edgeMask() }), [])
  const phs = useRef({ src: '', loading: false, ok: false, k: 0, wake: 0 })
  useEffect(() => () => { pmat.map?.dispose(); pmat.dispose(); rig.photoK[i] = 0 }, [pmat, i])
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
    /* on the 360 ring: placed from where the camera really is (same value the DOM pictures use), so niche and picture never drift apart */
    const onRail = rig.view === 'wardrobe' && walkTime() < 0 && !!cam
    const pe = onRail ? (cam.position.x - w.camOffset) / w.spacing : rig.scrollP
    const o = orbitAt(i - pe)
    /* the ring turns each piece about ITS OWN centre (the piece plane, z = PZ), not about the world origin 10 m behind it:
       that mistake used to fling every turned niche sideways, which is why the old orbit never looked like an orbit */
    const phi = -o.th, cxw = (onRail ? pe : rig.scrollP) * w.spacing + o.x * w.spacing, czw = -o.z * w.spacing
    g.current!.position.set(cxw - PZ * Math.sin(phi), 0, czw + PZ - PZ * Math.cos(phi))
    g.current!.rotation.y = phi
    const fd = orbitFade(Math.abs(i - pe)); g.current!.visible = fd > 0.01
    const pr = w.pieceW * 0.4 * (0.4 + 0.6 * fd), ph = w.pieceH * 0.05
    plinth.current!.position.set(0, w.floorY + ph / 2, PZ + 0.05); plinth.current!.scale.set(pr, ph, pr * 0.55)
    ring.current!.position.set(0, w.floorY + ph + 0.004, PZ + 0.05); ring.current!.scale.set(pr, pr * 0.55, 1)
    const nW = w.pieceW * 1.16, nH = w.pieceH * 1.08
    niche.current!.position.set(0, w.py + w.pieceH * 0.02, PZ - 0.9); niche.current!.scale.set(nW, nH, 1)
    nm.uniforms.uAsp.value = nW / nH; nm.uniforms.uI.value = (0.35 + 0.9 * s.s) * fd
    ringMat.color.setRGB(0.5 + 3.0 * s.s, 0.34 + 2.0 * s.s, 0.12 + 0.6 * s.s)
    const coneH = w.pieceH * 1.9
    cone.current!.position.set(0, w.floorY + coneH / 2, PZ - 0.35)
    cone.current!.scale.set(w.pieceW * 0.62, coneH, w.pieceW * 0.4)
    cm.uniforms.uHgt.value = 1
    cm.uniforms.uI.value = (0.18 + 0.82 * s.s) * fd
    pool.current!.position.set(0, w.floorY + 0.005, PZ - 0.2); pool.current!.scale.set(w.pieceW * 1.6, w.pieceW * 0.7, 1)
    pm.uniforms.uI.value = (0.04 + 0.16 * s.s) * fd
    wallPool.current!.position.set(0, w.py + w.pieceH * 0.15, PZ - 1.58); wallPool.current!.scale.set(w.pieceW * 2.4, w.pieceH * 1.7, 1)
    wm.uniforms.uI.value = (0.03 + 0.16 * s.s) * fd
    /* ---- the photo ---- */
    const P = phs.current, src = ITEMS[i] ? vaultSrc(ITEMS[i]) : ''
    /* the photos are not needed until the vault is in sight: loading them at the start of the walk put a burst of uploads on its first frames */
    const inVault = rig.view === 'wardrobe' || (rig.view === 'walk' && walkTime() > WALK_MS / 1000 * 0.55)
    if (inVault && !P.wake) P.wake = performance.now() + Math.abs(i - Math.max(0, Math.round(rig.scrollP))) * 260
    if (src && inVault && src !== P.src && !P.loading && performance.now() >= P.wake) {
      P.loading = true; P.src = src; P.ok = false
      const L = rig.layout
      photoLoader.load(photoUrl(src, Math.min(L.sh, L.sw * 4 / 3) * 0.75 || 400), loaded => {
        let tex: THREE.Texture = loaded
        if (P.src !== src) { tex.dispose(); P.loading = false; return }
        /* centre and size the subject in the arch; big cut-outs (1200x1600) are drawn at 768 wide so a phone's GPU memory is not wasted */
        const im = loaded.image as HTMLImageElement
        if (im && im.width > 0) {
          let c: HTMLCanvasElement | null = null
          try { c = fitSubject(im) } catch { c = null }
          if (!c && im.width > 800) { c = document.createElement('canvas'); c.width = 768; c.height = Math.round(768 * im.height / im.width); c.getContext('2d')?.drawImage(im, 0, 0, c.width, c.height) }
          if (c) { loaded.dispose(); tex = new THREE.CanvasTexture(c) }
        }
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
        pmat.map?.dispose(); pmat.map = tex; pmat.needsUpdate = true
        try { gl.initTexture(tex) } catch { /* uploaded on first draw instead */ }
        P.ok = true; P.loading = false
      }, undefined, () => { P.loading = false; P.src = ''; P.wake = performance.now() + 5000 })
    }
    const want = rig.view === 'wardrobe' && walkTime() < 0 && P.ok ? 1 : 0
    P.k = want > P.k ? Math.min(1, P.k + dt / 0.35) : want < P.k ? Math.max(0, P.k - dt / 0.2) : P.k
    rig.photoK[i] = P.k
    const am = Math.abs(i - pe), op = fd * P.k
    pmat.opacity = op
    const dim = 1 - Math.min(1, am / 1.15) * 0.55; pmat.color.setRGB(dim, dim, dim)
    const m = photo.current!
    m.visible = op > 0.004
    m.position.set(0, w.py, PZ + 0.02); m.scale.set(w.pieceW, w.pieceH, 1)
    m.rotation.y = s.a * (Math.sin(tnow / 1000 * 0.7) * 0.07 + rig.pointer.x * 0.05)
  })
  return (
    <group ref={g}>
      <mesh ref={wallPool} material={wm}><planeGeometry /></mesh>
      <mesh ref={niche} material={nm}><planeGeometry /></mesh>
      <mesh ref={cone} material={cm}><cylinderGeometry args={[0.06, 1, 1, 40, 1, true]} /></mesh>
      <mesh ref={pool} rotation={[-Math.PI / 2, 0, 0]} material={pm}><planeGeometry /></mesh>
      <mesh ref={photo} material={pmat} renderOrder={2} visible={false}><planeGeometry /></mesh>
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
  const lastF = useRef(0)
  useFrame(() => {
    const s = st.current, n = now()
    /* ~1 s between frames means the browser is throttling a hidden/occluded window, not a slow GPU: don't count it */
    const gap = n - lastF.current; lastF.current = n
    if (gap > 700) { s.slow = 0; s.lastCheck = n; return }
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
  const els = useRef<HTMLElement[]>([])
  useEffect(() => () => { rig.photoK.length = 0; clearOrbitCopy(); document.querySelectorAll<HTMLElement>('.track .stage').forEach(el => { el.style.transform = ''; el.style.zIndex = ''; el.style.opacity = ''; el.style.visibility = ''; el.style.removeProperty('--dim') }) }, [])
  useFrame(({ camera }) => {
    if (rig.view !== 'wardrobe') return
    if (!els.current.length || !els.current[0].isConnected) els.current = Array.from(document.querySelectorAll<HTMLElement>('.track .stage'))
    const w = world()
    applyOrbit(els.current, (camera.position.x - w.camOffset) / w.spacing, LAST, true)
  })
  return null
}
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

/* Quality tiers. Auto starts at med and moves one step at a time on the measured frame rate:
   up to high on fast GPUs (sustained 58+ fps), down to low under ~45 fps. ?q= pins a tier. */
type Tier = 'low' | 'med' | 'high'
const TIER = {
  low: { dpr: 1, dof: false, reflect: 0, bloomLevels: 5 },
  med: { dpr: 1.25, dof: false, reflect: 256, bloomLevels: 6 },
  high: { dpr: 1.75, dof: true, reflect: 512, bloomLevels: 8 }
} as const
export default memo(Experience)
function Experience({ onFail, paused = false }: { onFail: (why: string) => void; paused?: boolean }) {
  const [tier, setTier] = useState<Tier>(Q ?? 'med')
  const T_ = TIER[tier], low = tier === 'low'
  const dpr = Math.min(T_.dpr, window.devicePixelRatio || 1)
  rig.low = low; rig.quality = (Q ? 'pinned ' : 'auto ') + tier; rig.dpr = +dpr.toFixed(2)
  /* on a portrait phone the floor sits under the dark copy panel, so its mirror (a second render of the whole scene) is paid for and never seen */
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth)
  useEffect(() => { const f = () => setPortrait(window.innerHeight > window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  const path = useRef<WalkPath | null>(null)
  /* the walk-in set (shop, stairs, golden wardrobe, Lorenzo) is built once the first frame is up, in an idle moment,
     so it never adds to the first paint; it is ready long before anyone can choose the premium wardrobe */
  const [walkOn, setWalkOn] = useState(false)
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
    const go = () => setWalkOn(true)
    const id = window.setTimeout(() => { if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 1500 }); else go() }, 700)
    return () => clearTimeout(id)
  }, [])
  const dof = useRef<DepthOfFieldEffect | null>(null)
  /* a tier change rebuilds the post chain (a visible hitch), so it waits until nothing is moving:
     never mid-entry or mid-walk; applied on the next calm moment instead */
  const want = useRef<Tier | null>(null)
  /* frozen in the vault too: a rebuild there would hitch a slide */
  const calm = () => rig.view !== 'transition' && rig.view !== 'walk' && rig.view !== 'wardrobe' && !(walkTime() >= 0 && walkTime() < WALK_MS / 1000 + 0.5) && (!rig.descentAt || performance.now() - rig.descentAt > DESCENT_MS)
  const ask = (f: (t: Tier) => Tier) => { want.current = f(want.current ?? tier) }
  useEffect(() => {
    /* ...and only once the view has been settled for a couple of seconds (not on arrival in the vault) */
    let since = performance.now(), was = rig.view as string
    const id = window.setInterval(() => {
      const n = performance.now()
      if (rig.view !== was || !calm()) { was = rig.view; since = n; return }
      if (want.current && n - since > 2200) { setTier(want.current); want.current = null }
    }, 400)
    return () => clearInterval(id)
  }, [])
  const down = () => ask(t => t === 'high' ? 'med' : 'low')
  const up = () => ask(t => t === 'low' ? 'med' : 'high')
  return (
    <Canvas className="gl" dpr={dpr} frameloop={paused ? 'demand' : 'always'} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 0, GATE_CAM] }}
      onCreated={({ gl, scene }) => { gl.setClearColor('#050303'); scene.fog = new THREE.Fog('#050303', 9, 30) }}
      aria-hidden="true">
      {!HQ && <PerformanceMonitor bounds={() => [45, 58]} flipflops={4} onDecline={down} onIncline={up} onFallback={() => { if (rig.fps && rig.fps < 45) ask(() => 'low') }} />}
      <ambientLight intensity={1.2} />
      <CameraRig path={path} />
      <Atmosphere path={path} />
      <Room low={low || portrait} res={T_.reflect} />
      {ITEMS.slice(0, LAST).map((_, i) => <Piece key={i} i={i} />)}
      {(walkOn || rig.walkAt > 0) && <Walk low={low} path={path} />}
      <Dust />
      <Storefront />
      <Gate />
      <ScreenFX />
      <Stats />
      <Health onFail={onFail} />
      <DomSync />
      {T_.dof && <Focus fx={dof} />}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        {T_.dof ? <DepthOfField ref={dof} focusDistance={D} focusRange={3} bokehScale={0} resolutionScale={0.5} /> : <></>}
        <Bloom mipmapBlur levels={T_.bloomLevels} intensity={low ? 0.8 : 1.15} luminanceThreshold={0.95} luminanceSmoothing={0.2} radius={0.75} />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.22} />
        <Vignette offset={0.28} darkness={0.82} />
      </EffectComposer>
    </Canvas>
  )
}
