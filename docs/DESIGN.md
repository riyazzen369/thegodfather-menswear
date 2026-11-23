# Design — The Godfather Menswear

The site is a night visit to the boutique: a red neon logo, a rainy storefront, a host who greets you, and a hidden golden vault where the pieces wait on lit plinths. Everything is built for a phone first (390px wide) and scales up to 1920px.

## Brand palette

Defined as CSS custom properties in `src/styles.css` (`:root`).

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#070405` | page background, near-black |
| `--ink2` | `#120a0a` | panels, sheets |
| `--wool` | `#1d1414` | cards, raised surfaces |
| `--oxblood` | `#6b1f26` | dark red accents, borders, velvet |
| `--crimson` | `#e3182a` | primary buttons, the logo red |
| `--neon` | `#ff2a3a` | neon glow, cursor ring, focus accents |
| `--bone` | `#e8dfcf` | body text on dark |
| `--muted` | `#a69a89` | secondary text |
| `--warm` | `#f3dcc0` | warm highlights, prices in the storefront |
| gold (vault) | `#e9c46a`, `#f2c46b`, `#8a6a2c` | vault brass, inspect kicker/price, turntable |
| honey wood (wardrobe gate) | `#9c6428`, `#cf9447`, `#a86d2e` | carved door leaves (grain gradient) |
| gilt relief | `#fff1b8` → `#e8b852` → `#b07a22` → `#6e4612` | rosettes, friezes, architrave mouldings |
| white marble | `#ece5d8` base, veins `rgb(120–150 grey)` | the wall and classical trim around the gate |
| gold flood (3D) | `rgb(2.2, 1.6, 0.7)` HDR | vault door light, inspect ring (tone mapping off) |

Easing token: `--ease: cubic-bezier(.22,.61,.36,1)` (a soft ease-out used for every UI transition).

## Fonts

Self-hosted in `src/fonts/` (woff2, `font-display: swap`), so there's no runtime dependency on Google Fonts.

| Token | Family | Use |
|---|---|---|
| `--slab` | Alfa Slab One (400) | headlines and piece names in the vault ("Lilac Hour"), echoing the logo's slab lettering |
| `--serif` | Bodoni Moda (400–700, italic 400) | Lorenzo's line, the inspect title, editorial accents |
| `--sans` | Instrument Sans (400–600) | UI, body copy, buttons, labels |

Kicker labels: uppercase, 0.66rem, letter-spacing 0.2em.

## Logo rules

- Use only the real store logo (`public/brand/logo*.webp|png`, cut from `assets-src/brand/logo.jpg` with black keyed out). Don't redraw it or retype "The Godfather".
- Always red on black or near-black. Never on white, gold or a photo without a dark scrim.
- The gate mark is plain HTML in `index.html` (paints before any JS). There are no CSS filters on the mark itself, so it stays crisp. The glow is a separate halo layer behind it.
- Minimum size is 120px wide (top bar), 160px-wide asset. Keep clear space of at least 25% of the logo height on all sides.
- Sizes: `logo-160/240/320/800.webp` plus `logo.webp` (1550w) via `LOGO_SET` srcset. Favicons are derived from the same mark.
- If a vector master turns up, replace `public/brand/` and re-run `npm run images` (see CONTENT.md).

## Scene-by-scene flow and timings

`TRANSITION_MS = 2500` and `WALK_MS = 6400` live in `src/rig.ts`. Walk keyframes live in `src/three/Experience.tsx` (`makeWalk`, `KEY_AT`, `OPEN_AT`, `OPEN_S`, `INTO_LIGHT`).

| # | Scene | Timing | What happens |
|---|---|---|---|
| 1 | **Gate** | logo fades in 0.3–0.8s, prompt at ~1.1s | Only the red logo on black, with a breathing red halo and film grain. A red ring follows the cursor (fine pointers). Tap/click/Enter to go in. |
| 2 | **Doors** | 2.5s (`TRANSITION_MS`), Skip | The logo splits into two hinged CSS-3D doors (`gateDoorL/R`), red light floods in behind, and the camera dollies through the store photo as red curtains part. |
| 3 | **Storefront** | continuous | Rainy night storefront: lights flicker on (`lightsOn`), the neon sign glows and hums (`neonOn`, `hum`), there's rain in front and behind with floor splashes (`Rain.tsx`), and a slow dolly-in with depth parallax. Copy: "Night boutique · Bespoke tailoring" / "Dressed for the family business." |
| 4 | **Lorenzo greeting** | rises in ~0.6s, line types out ~2–3s | Lorenzo (fedora, black pinstripe, red tie, burning cigar with ember pulse and smoke, white Persian cat that blinks) rises in at the bottom right and breathes. His time-of-day line types out and offers two choices: **The Godfather Attire Collection** and **The Godfather Elite Wardrobe**. Skip/Esc shows everything at once. |
| 5 | **Walk-in (Premium)** | 0–3.4s walk, 3.5s key, 4.15–5.4s doors, 4.8s into the light, 5.75s land (6.4s total), Skip/Esc | The storefront hands over to the 3D camera. Lorenzo, seen from behind with the cat in his arm, leads briskly down the red runner between suit racks. The hidden wardrobe opens (0.7–1.45s), and there's a quick brass stair descent (2.2–2.8s). **Highlight, the palace wardrobe gate:** a tall pair of carved honey-wood doors with gilded relief (a sunburst rosette medallion in a square panel, scroll-and-acanthus friezes above and below, a lower medallion panel), in a gilded bead-and-egg architrave, white classical pilasters and cornice, and a white/cream marble wall with soft grey veins. Lorenzo becomes the doorman: he stops in a black tailcoat with white gloves, his right hand at the gilded lever handle and his left behind his back holding the cigar, with the white Persian cat on his shoulder. The lock glints (3.5s), a seam of light cracks (3.95s), the doors swing inward over 1.25s (4.15s), warm gold light floods out from deep behind them, and the camera glides through into the showcase as the first piece lights up. Skip fades through black in 320ms. |
| 6 | **Vault (showcase)** | change ≈0.5s spring | 12 pieces, each on a lit plinth in a gold arch, with brass panels, dark marble reflections and velvet accents. Swipe, drag, wheel, arrow keys, Home/End, or the arrow buttons. The focused piece is lit, sways and tilts with the pointer; neighbours dim (opacity overlay 0.58). Counter, Enquire on WhatsApp, View details, and the private-visit panel at the end. |
| 7 | **Inspect (drag to flip)** | open 0.45s fade + 0.55s scale, flip spring ≈0.45s, close 0.38s | "View details" or a tap on the focused piece opens the garment card on a gold-ringed plinth with a soft shadow. Drag sideways to flip it around its vertical axis, following the finger 1:1; on release it springs to the nearest face (front 0° / back 180°), and a quick fling flips it. A `FRONT / BACK` indicator (the current face in gold), a "Show back / Show front" button and ←/→ keys do the same. Pinch or scroll zooms (1–2.4×). There's no idle sway. The back is a real photo if `back` is set, otherwise the shared plain back (the piece's own outline, mirrored, in one dark plain fabric tone with a centre seam). Reduced motion swaps the faces instantly. Name, tagline, price, WhatsApp and Full details stay in the panel; Esc/× returns focus to the opener. |
| 8 | **Attire Collection** | cards fade up with 0.12s stagger | Grid of all pieces: 2 columns at 390px, 3 from 760px, 4 from 1100px. Filter chips: All, Suits and formal, Shirts, Wedding, Statement pieces. A card opens the detail sheet; "Enter the premium wardrobe" goes down to the vault (`DESCENT_MS = 2400`). |
| — | **Detail sheet** | 0.12s stagger on details | Bottom sheet on mobile (swipe down to close), right-side panel ≥960px. 3–4 images (swipeable gallery), fabric, fit, made to measure, delivery, prefilled WhatsApp enquiry. |
| — | **Repeat visit** | — | In the same session (`sessionStorage gf-entered`), the gate and doors are skipped and the visit lands on Lorenzo with a shorter build-up. |

## Animation specs

- **UI transitions:** opacity and transform only, `--ease`, 0.3–0.6s. Staggers of 0.12s.
- **Camera:** one CatmullRom spline (centripetal) for the walk, distance-over-time from a monotone spline. It uses a wider lens while walking, depth of field on high tier, and crimson→gold fog and light.
- **Lorenzo walk:** a 24-frame keyed sprite atlas (5×5, 2 steps) plus a key-raise frame. Frames are chosen by distance walked (no foot sliding) and blended. Shader fog and a rim light come from the alpha edge.
- **Vault rail:** a critically damped spring (ω = 11, ~0.5s settle, 1/120s sub-steps, real-time up to 250ms frames). It's stepped inside the 3D frame before the camera and DOM pictures, so they never desync. Drag has an axis lock; release moves ±1 piece if dx > 50px or v > 0.4px/ms and hands the velocity to the spring. The wheel is limited to one piece per 650ms gesture. Neighbours are pre-decoded.
- **Wardrobe gate (vault doors):** built in code in `Walk` (`three/Experience.tsx`). The canvas textures are `carvedLeafTexture()` (512×1130: raised bevelled panels, `rosette()`, `frieze()`, gilt drawn twice with a dark offset so it reads as carved relief), `architraveTexture()` and `whiteMarbleTexture()`. The leaves are 2.15 × 5.2 m each. Lorenzo's doorman pose is cell 25 of `public/walk/lorenzo-walk.webp` (master: `assets-src/lorenzo/lorenzo-doorman.jpg`), held in both blend slots once he stops.
- **Vault door timing:** key turn `smooth(KEY_AT+0.35, KEY_AT+0.6)`, seam `smooth(KEY_AT+0.45, OPEN_AT)`, doors `easeInOut((t-OPEN_AT)/OPEN_S)`, gold flood `smooth(OPEN_AT-0.1, OPEN_AT+0.55)` easing to 30% by the end.
- **Storefront:** `dollyIn`, `lightsOn`, `neonOn`, `hum`, `sheen`; Lorenzo `hostIn`, `breathe`, `catBlink`, `ember`, `smoke`.
- **Reduced motion:** no dolly, sway, tilt, typing or walk. Plain 0.25s fades, the 2D room, and the inspect view as a still image.

## Responsive breakpoints

| Width | Changes |
|---|---|
| < 560px | compact top bar, single-column storefront copy, bottom sheets |
| 640px | larger type scale |
| 760px | Attire Collection grid 3 columns |
| 900px | storefront panel beside Lorenzo |
| ≥ 960px | desktop: top nav, vault "Back to the shop" and counter, detail = right-side panel, inspect panel in a right column (min(30vw, 420px)) |
| 960–1279px | tightened desktop spacing |
| ≥ 1100px | Attire Collection grid 4 columns |
| `(hover:hover) and (pointer:fine)` | cursor ring, hover states, pointer tilt |

Safe-area insets (`--sat/--sab/--sal/--sar`) pad the top bar, sheets and the inspect panel on notched phones. Touch targets are at least 44px.

## Accessibility

- Semantic landmarks. Lorenzo's section is `aria-labelledby` his line and `aria-busy` while animating. A polite live region announces piece changes.
- Full keyboard support: Enter on the gate, arrows/Home/End in the vault, Esc closes inspect/sheet and skips the walk. Focus is trapped in dialogs and returned to the opener. Visible `:focus-visible` outlines.
- Every image has alt text (`data.ts`). Colour contrast is bone on ink (≥ 12:1) and crimson buttons with bone text.
- `prefers-reduced-motion` and no-WebGL get the 2D version with the same flow and content.

## Performance and quality tiers

- **Tiers** (`Experience.tsx`): **low** (pixel ratio 1, plain floor, no DOF), **med** (DPR ≤ 1.25, half-res reflections, no DOF), **high** (DPR ≤ 1.75, full reflections, DOF). It starts high. drei `PerformanceMonitor` (bounds 45–58 fps, 4 flip-flops) steps down or up, but only when calm (not during the transition, walk or vault arrival) and after the view has settled for 2.2s, so it never hitches mid-animation.
- **GPU watchdog:** if the context is lost, the vault renders black, or fps stays under 8, it switches to the 2D room mid-visit. Frame gaps over 700ms (background tabs, OS throttling) are ignored.
- **Images:** product pictures are DOM `<picture>` elements (AVIF/WebP 512w + 864w) kept on their 3D anchors each frame, with 12×16 blur placeholders. The focused piece and its two neighbours load first, and the vault set is fetched during the walk. Walk textures are uploaded up front (`initTexture`) and shaders compiled with `compileAsync`.
- **Code splitting:** `Experience` and `Inspect` are lazy chunks. The gate is HTML and paints before JS.
- Measure with `?debug=fps`, `npm run test:vault-fps`, and Lighthouse (`npx lighthouse <url>`).
