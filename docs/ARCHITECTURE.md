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
           ├─ <Grid/>        (Attire Collection)
           └─ <Rain/>        (2D canvas rain layers)
```

## Components

| File | Responsibility |
|---|---|
| `App.tsx` | View state machine, entry/transition timers, walk start/skip/land, vault rail (spring, pointer/touch/wheel/keyboard), live region, detail sheet, inspect open/close + focus management, 2D/3D mode, `?debug=fps` overlay |
| `three/Experience.tsx` | `CameraRig` (gate, storefront, walk spline, vault anchors, steps the rail first), `Gate`, `Storefront`, `ScreenFX`, `Walk` (shop interior, racks, hidden wardrobe, stairwell, golden vault doors, Lorenzo sprite leader), `Atmosphere`, `Room` (vault: brass, marble reflector, arches), `Piece` (plinths, spotlights), `Dust`, `DomSync` (puts DOM pictures on 3D anchors each frame), `Focus` (DOF), `Health` (GPU watchdog), `Stats`, tiers via `PerformanceMonitor` |
| `Inspect.tsx` | **Drag-to-flip** product view, CSS 3D only (`.flip-card` with two `backface-visibility: hidden` faces, one composited layer; no WebGL, so it's the same in 3D and 2D modes). A horizontal drag turns the card 1:1: one card *layout* width (`offsetWidth`, unaffected by the rotation) = 180°. On release a critically damped spring (ω 13) settles on the nearest face. A fling (velocity over the last 100 ms > 0.4 px/ms, or a flick under 260 ms and over 36 px) flips to the next face. There's no idle motion. Pinch (two pointers) and wheel zoom 1–2.4×. The `Front / Back` indicator is polite-live; the "Show back / Show front" button and ←/→ keys flip. Under reduced motion it swaps instantly. The front is the cut-out `public/img/cut/<slug>-1.webp`; the back is `item.back` if set, else the **shared plain back** (`.flip-plain`: the piece's own cut-out as a CSS mask, mirrored, filled with one plain dark fabric tone and a soft centre seam). Test hook: `window.__inspectFlip()` → `{ a, face }` |
| `Tailor.tsx` | Lorenzo host layer: phases `in` → `out`/`lead`/`walk`, typed line by local time, choice buttons |
| `Grid.tsx` | Attire Collection grid and filter chips |
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
                                       ├─ Attire Collection ──▶ grid ──"Enter the premium wardrobe"──▶ wardrobe (descent 2.4s)
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

## Live catalogue (Supabase)

`ITEMS` is one shared array. When `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set at build time, `src/main.tsx` first applies the catalogue
this browser cached last (localStorage `gf-catalogue-v1`), then `src/supa.ts` reads published rows (anon key, 2.5 s timeout) and swaps `ITEMS` in place
(premium first, then attire, each by `sort`). The vault uses the first `vaultCount()` items (premium); the Attire Collection and detail sheet use all of them.
Module-level counts in `App.tsx` and `three/Experience.tsx` re-read via `onCatalogue()`. A change that adds, removes or reorders pieces remounts `<App>`
(key bump); an edit to existing pieces just re-renders. Updates arrive through a realtime subscription on `catalogue_rev` (bumped by a trigger on every
product change) plus a re-read when the tab becomes visible. If the DB is unreachable nothing changes: cached copy or bundled `src/data.ts`.
DB photos are absolute Storage URLs: `Pic` skips the local AVIF/512w variants for them and takes the blur placeholder from the row (`REMOTE_LQIP`);
the flip view uses `front_cut_path` when present, else the photo, and `back_path` or the shared plain back. The admin is a second Vite entry
(`admin/index.html` → `src/admin/`), so the store bundle carries none of its code; supabase-js is a lazy chunk and is left out entirely when the env is empty.
Details, schema and security: [ADMIN.md](ADMIN.md).

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
- `inspect-flip.js` (`npm run test:inspect`): all 12 items on 390×844 (touch) and 1440×900 (mouse). Checks that it opens on the front, a slow drag follows 1:1 and lands on the back, a fling flips, a short slow drag springs back, the button and arrow keys flip, and there are no page errors (146 checks). `SHOTS=1` saves mobile front/back.
- `vaultfps.js`: rAF frame stats while sliding (`npm run test:vault-fps`). `vaultopen.js`: stills of the vault key and the doors opening.
- `rls-local.mjs` (`npm run test:rls`): the Supabase migration in PGlite, 20 access-rule checks. `live-catalogue.js` (`npm run test:live`): site + admin against a mocked Supabase (see ADMIN.md).
- `zeus/zeus.js`: the same checks on a real Windows laptop GPU.
