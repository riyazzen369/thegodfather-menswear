/* The canvas: quality tiers that adapt to the device, post-processing, and a safety net that hands over to the 2D page if the GPU fails. */
import { useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { rig } from '../rig'
import type { Rail } from '../rail'
import { FOV, D } from './world'
import { Room } from './Room'
import { Ring } from './Ring'
import { CameraRig } from './CameraRig'

type Tier = 'low' | 'med' | 'high'
const TIER = { low: { dpr: 1, bloom: false }, med: { dpr: 1.25, bloom: true }, high: { dpr: 1.75, bloom: true } } as const
const QS = new URLSearchParams(location.search), PIN = (['low', 'med', 'high'] as const).find(q => q === QS.get('q')) ?? null    // ?q=low|med|high pins a tier (for testing)

/* the rail is stepped from the 3D frame, before anything is placed: negative priority runs first (a positive one would disable auto-render) */
function Driver({ rail }: { rail: Rail }) { useFrame(() => rail.step(performance.now()), -2); return null }
function Health({ onFail }: { onFail: (why: string) => void }) {
  const gl = useThree(t => t.gl)
  useEffect(() => { const c = gl.domElement, lost = (e: Event) => { e.preventDefault(); onFail('webgl context lost') }; c.addEventListener('webglcontextlost', lost); return () => c.removeEventListener('webglcontextlost', lost) }, [gl, onFail])
  useFrame((_, dt) => { rig.fps = rig.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05 })      // smoothed frame rate for ?debug=fps
  return null
}

export default function Scene({ rail, reduced, onFail }: { rail: Rail; reduced: boolean; onFail: (why: string) => void }) {
  const [tier, setTier] = useState<Tier>(PIN ?? 'med'); rig.quality = tier
  const T = TIER[tier], dpr = Math.min(T.dpr, window.devicePixelRatio || 1)
  return (
    <Canvas className="gl" dpr={dpr} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: FOV, near: 0.1, far: 60, position: [0, 0, D] }}
      onCreated={({ gl, scene }) => { gl.setClearColor('#050303'); scene.fog = new THREE.Fog('#050303', 9, 24) }} aria-hidden="true">
      {!PIN && <PerformanceMonitor bounds={() => [45, 58]} flipflops={3} onDecline={() => setTier(t => t === 'high' ? 'med' : 'low')} onIncline={() => setTier(t => t === 'low' ? 'med' : 'high')} />}
      <Driver rail={rail} />
      <CameraRig reduced={reduced} />
      <Room />
      <Ring />
      <Health onFail={onFail} />
      {T.bloom && <EffectComposer multisampling={0}><Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.95} luminanceSmoothing={0.2} radius={0.7} /><Vignette eskil={false} offset={0.25} darkness={0.7} /></EffectComposer>}
    </Canvas>
  )
}
