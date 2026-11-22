# Architecture

A single-page static site: React 19 renders the DOM layer (gate, storefront, Lorenzo, vault UI, sheets, grid). One react-three-fiber `<Canvas>` renders the 3D world behind it. They share a mutable `rig` object (`src/rig.ts`) instead of React state, so nothing re-renders per frame.

```
index.html ── gate logo (HTML, paints first)
src/main.tsx ── <App/>
  App.tsx ─┬─ <Experience/>  (lazy, three/Experience.tsx; one Canvas, paused when hidden or inspecting)
           ├─ <Tailor/>      (Lorenzo storefront scene + choices)
           ├─ vault DOM      (.track > .slide > <Pic/> pictures + captions + actions)
           ├─ <Inspect/>     (lazy; own small Canvas turntable, or a CSS-tilt fallback)
           ├─ detail sheet   (#sheet, gallery, specs, WhatsApp)
           ├─ <Grid/>        (Attire Tour)
           └─ <Rain/>        (2D canvas rain layers)
```

## Components

| File | Responsibility |
|---|---|
| `App.tsx` | View state machine, entry/transition timers, walk start/skip/land, vault rail (spring, pointer/touch/wheel/keyboard), live region, detail sheet, inspect open/close + focus management, 2D/3D mode, `?debug=fps` overlay |
| `three/Experience.tsx` | `CameraRig` (gate, storefront, walk spline, vault anchors, steps the rail first), `Gate`, `Storefront`, `ScreenFX`, `Walk` (shop interior, racks, hidden wardrobe, stairwell, golden vault doors, Lorenzo sprite leader), `Atmosphere`, `Room` (vault: brass, marble reflector, arches), `Piece` (plinths, spotlights), `Dust`, `DomSync` (puts DOM pictures on 3D anchors each frame), `Focus` (DOF), `Health` (GPU watchdog), `Stats`, tiers via `PerformanceMonitor` |
| `Inspect.tsx` | `garmentGeo` (72×96 grid displaced by a chamfer distance transform of the cut-out alpha plus luminance relief; curved back side), `Garment`, `Turntable`, OrbitControls, panel with actions, reduced-motion/no-WebGL fallback |
| `Tailor.tsx` | Lorenzo host layer: phases `in` → `out`/`lead`/`walk`, typed line by local time, choice buttons |
| `Grid.tsx` | Attire Tour grid and filter chips |
| `Pic.tsx` | `<picture>` with AVIF/WebP srcset, blur placeholder crossfade, `preloadPic`, `Mark` (logo) |
| `Rain.tsx` | Canvas rain + splashes, dt-clamped, paused off-screen |
| `rig.ts` | Shared state and timings: `view`, `index`, `scrollP`, `walkAt`, `descentAt`, `railStep`, `glStepAt`, `fps`, freeze flags; `walkTime()` |
| `data.ts` | Content: `CONTACT`, `SAMPLE_PRICES`, `ITEMS`, `CATEGORIES`, `CHOICES`, `HOST`, `TAILOR`, logo/store paths |

## 3D scene

- The world is laid out along −Z: gate (z 8), storefront photo plane, shop interior with racks and red runner, the hidden wardrobe (`WARD_Z` 11.8 in walk space) and brass stairwell (12 steps), then the golden vault door (`VAULT_DOOR_Z` −8.4) and the vault rail of 12 anchors spaced along X.
- **Walk:** `makeWalk()` builds a centripetal CatmullRom curve and two time splines, `dist(t)` for the camera and `lead(t)` for Lorenzo's distance ahead. The camera samples the curve by arc length, adds a light head bob, and blends to the first vault anchor at the end.
- **Vault:** the camera is placed from `rig.scrollP` (a float piece index) each frame. `DomSync` then transforms the DOM pictures with `translate3d` so they sit on their plinths.
- **Materials:** custom shader materials for glow, cones, niches, velvet, the Lorenzo sprite (chroma-keyed atlas with fog and rim), and procedural brass/marble canvas textures. Postprocessing: bloom, vignette, DOF on high tier.

## State flow

```
gate ──tap──▶ transition (2.5s) ──▶ tailor (Lorenzo)
                                       ├─ Attire Tour ──▶ grid ──"Enter the premium wardrobe"──▶ wardrobe (descent 2.4s)
                                       └─ Premium ──▶ walk (6.4s, Skip/Esc) ──▶ wardrobe (vault)
wardrobe ──View details / tap focused──▶ inspect ──Full details──▶ sheet
        └─ Back to the shop ──▶ tailor          inspect/sheet ──Esc──▶ wardrobe (focus returns)
```

- `view` lives in React state (`setView`) and is mirrored to `rig.view` for the scene. `sessionStorage gf-entered` skips the gate on repeat visits.
- The vault rail uses `car` ref `{p, v, target, drag, W, maxP}`. `goTo(i)` sets the target and preloads neighbours. `railStep(now)` integrates the spring and writes `scrollLeft` + `rig.scrollP`. In 3D it is called from `CameraRig`'s `useFrame`; a fallback rAF loop drives it in 2D or when the canvas is paused.
- Quality tier changes are deferred until calm (`calm()`), and the GPU watchdog calls `onFail` → 2D mode.

## Data model (`src/data.ts`)

```ts
type Category = 'formal' | 'wedding' | 'statement' | 'shirts'
type Img  = { src: string; alt: string; source: 'generated' | 'store photo' }
type Item = { category: Category; name: string; tagline: string; fabric: string; price: number | null
              images: Img[]; colours: { name: string; hex: string }[]
              details: { fit: string; madeToMeasure: string; delivery: string } }
CONTACT = { whatsapp, phone, phoneLabel, address, bookingUrl }
SAMPLE_PRICES: boolean
```

WhatsApp links are built as `https://wa.me/<whatsapp>?text=<prefilled enquiry about the piece>`. Asset URLs are prefixed with `import.meta.env.BASE_URL` (Vite `base: './'`), so the build works under any sub-path.

## URL debug flags

| Flag | Effect |
|---|---|
| `?2d` | force the 2D version |
| `?force3d` | never fall back to 2D for low fps (software GL in tests) |
| `?hq` | never drop quality |
| `?q=low\|med\|high` | pin a quality tier |
| `?debug=fps` | overlay: fps (and min), mode, tier, DPR, view, watchdog |
| `?freeze=1.3` | hold the entry transition at 1.3s |
| `?wfreeze=4.2` | hold the premium walk at 4.2s (e.g. `4.75` = doors open, gold flood) |
| `window.__rig` / `__fps` / `__glHealth` | shared state, frame rate, watchdog reading (set `__rig.walkFreeze` live) |

## Tests (`tests/`)

- `test3d.js`: 89 checks on mobile (390×844, touch via CDP) and desktop (1440×900). Covers the gate, doors, storefront, Lorenzo, walk, vault navigation (keys, wheel, trackpad, drag, swipe), inspect, sheet, grid, focus, a11y basics and page errors. Run it with `npm test` (`URL=https://… node tests/test3d.js` for the live site).
- `vaultfps.js`: rAF frame stats while sliding (`npm run test:vault-fps`). `vaultopen.js`: stills of the vault key and the doors opening.
- `zeus/zeus.js`: the same checks on a real Windows laptop GPU.
