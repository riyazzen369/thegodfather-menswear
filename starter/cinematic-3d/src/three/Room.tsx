/* The set: a dark backdrop with a soft pool of light, plus slow dust in the light. Cheap on purpose (two quads and ~200 points). */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world } from './world'

const glow = (c: THREE.ColorRepresentation, i: number) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uC: { value: new THREE.Color(c) }, uI: { value: i } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 uC; uniform float uI; varying vec2 vUv; void main(){ float r = length((vUv - vec2(0.5, 0.45)) * vec2(1.0, 1.15)) * 2.0; gl_FragColor = vec4(uC * pow(max(0.0, 1.0 - r), 2.2) * uI, 1.0); }'
})

export function Room() {
  const back = useRef<THREE.Mesh>(null), pool = useRef<THREE.Mesh>(null), dust = useRef<THREE.Points>(null)
  const bm = useMemo(() => glow('#c8963c', 0.5), []), pm = useMemo(() => glow('#ffd9a0', 0.22), [])
  const geo = useMemo(() => { const g = new THREE.BufferGeometry(), p = new Float32Array(240 * 3); for (let i = 0; i < p.length; i++) p[i] = Math.random(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); return g }, [])
  const dm = useMemo(() => new THREE.PointsMaterial({ size: 0.02, color: '#ffd9a0', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  useFrame(({ camera, clock }) => {
    const w = world()
    back.current!.position.set(camera.position.x, camera.position.y * 0.5, -2.2); back.current!.scale.set(w.visW * 1.6, w.visH * 1.6, 1)
    pool.current!.position.set(camera.position.x, camera.position.y * 0.5 + w.visH * 0.04, -1.2); pool.current!.scale.set(w.pieceW * 3.4, w.pieceH * 1.9, 1)
    const d = dust.current!; d.position.set(camera.position.x - w.visW, camera.position.y - w.visH * 0.7, -4); d.scale.set(w.visW * 2, w.visH * 1.4, 4)
    d.rotation.y = Math.sin(clock.elapsedTime * 0.05) * 0.05
  })
  return (
    <>
      <mesh ref={back} material={bm}><planeGeometry /></mesh>
      <mesh ref={pool} material={pm}><planeGeometry /></mesh>
      <points ref={dust} geometry={geo} material={dm} />
    </>
  )
}
