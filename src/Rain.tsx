import { useEffect, useRef } from 'react'

/* Lightweight 2D rain: slanted streaks lit by the shop, plus splash rings on the wet floor band.
   layer 'back' sits behind the host, 'front' in front of him (fewer, longer, brighter drops). */
export default function Rain({ layer, floor = 0.8, paused = false }: { layer: 'back' | 'front'; floor?: number; paused?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!, g = c.getContext('2d')!
    let W = 0, H = 0, raf = 0, last = performance.now()
    const dpr = Math.min(1.5, devicePixelRatio || 1)
    const front = layer === 'front'
    type Drop = { x: number; y: number; v: number; l: number; a: number }
    type Ring = { x: number; y: number; r: number; a: number }
    let drops: Drop[] = [], rings: Ring[] = []
    const size = () => {
      W = c.clientWidth; H = c.clientHeight; c.width = W * dpr; c.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round((W * H) / (front ? 26000 : 5200))
      drops = Array.from({ length: n }, () => mk(true))
    }
    const mk = (any = false): Drop => ({ x: Math.random() * (W + 200) - 100, y: any ? Math.random() * H : -Math.random() * 200,
      v: (front ? 1500 : 900) + Math.random() * 500, l: front ? 34 + Math.random() * 40 : 10 + Math.random() * 16, a: front ? 0.14 + Math.random() * 0.2 : 0.08 + Math.random() * 0.14 })
    size()
    const ro = new ResizeObserver(size); ro.observe(c)
    const slant = 0.16
    const tick = (t: number) => {
      /* rAF time can be a little behind performance.now() on the first frame: never step backwards */
      const dt = Math.max(0, Math.min(0.05, (t - last) / 1000)); last = Math.max(last, t)
      g.clearRect(0, 0, W, H)
      g.lineCap = 'round'
      for (const d of drops) {
        d.y += d.v * dt; d.x += d.v * dt * slant
        const warm = d.x > W * 0.25 && d.x < W * 0.8 && d.y < H * 0.75
        g.strokeStyle = warm ? `rgba(255,${180 + (d.x % 40)},${170},${d.a * 1.3})` : `rgba(210,215,230,${d.a})`
        g.lineWidth = front ? 1.4 : 0.8
        g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - d.l * slant, d.y - d.l); g.stroke()
        const ground = H * (floor + (front ? 0.12 : 0.05) * Math.random())
        if (d.y > ground) {
          if (!front && d.y < H && Math.random() < 0.5) rings.push({ x: d.x, y: d.y, r: 1, a: 0.35 })
          Object.assign(d, mk())
        }
      }
      if (!front) {
        rings = rings.filter(r => r.a > 0.02)
        for (const r of rings) {
          r.r += 26 * dt; r.a *= Math.pow(0.04, dt)
          g.strokeStyle = `rgba(255,190,190,${r.a})`; g.lineWidth = 0.7
          g.beginPath(); g.ellipse(r.x, r.y, Math.max(0.1, r.r), Math.max(0.03, r.r * 0.28), 0, 0, Math.PI * 2); g.stroke()
        }
      }
      raf = requestAnimationFrame(tick)
    }
    if (!paused) raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [layer, floor, paused])
  return <canvas ref={ref} className={`rain rain-${layer}`} aria-hidden="true" />
}
