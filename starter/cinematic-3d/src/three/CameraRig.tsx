/* The camera follows the rail (rig.p) with a little parallax and an entrance dolly. Following is nearly rigid on purpose: the rail
   already eases, a third smoothing stage only adds lag. */
import { useFrame } from '@react-three/fiber'
import { rig, easeOut, clamp01 } from '../rig'
import { world, D } from './world'

export function CameraRig({ reduced }: { reduced: boolean }) {
  useFrame(({ camera }, dt) => {
    const w = world(), t = clamp01((performance.now() - rig.started) / 1800), dolly = reduced ? 0 : (1 - easeOut(t)) * 3.2
    const tx = rig.p * w.spacing + w.camDx + (reduced ? 0 : rig.pointer.x * 0.12), ty = w.camDy + (reduced ? 0 : rig.pointer.y * 0.06)
    const a = 1 - Math.exp(-dt * 24)
    camera.position.x += (tx - camera.position.x) * a; camera.position.y += (ty - camera.position.y) * a; camera.position.z = D + dolly
    camera.lookAt(camera.position.x - (reduced ? 0 : rig.pointer.x * 0.05), camera.position.y, 0)
  })
  return null
}
