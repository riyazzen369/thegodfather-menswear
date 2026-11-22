# The Godfather Menswear — cinematic 3D storefront

Live: **https://riyazzen369.github.io/thegodfather-menswear/** · custom domain (once DNS points to GitHub): https://www.thegodfatherclothings.in/

React 19 + Three.js (react-three-fiber) + Vite. Mobile first (390px up to 1920px), red-and-black brand look taken from the real store photo, with the store's real logo.

> **License:** none. This is a private project, all rights reserved. No permission is granted to copy, modify or redistribute it.

## Rebuild it in VS Code

Prerequisites: [Node.js 24](https://nodejs.org) (`.nvmrc`; 20.19+ works), Git, VS Code.

```bash
git clone https://github.com/riyazzen369/thegodfather-menswear.git
cd thegodfather-menswear
code .                 # accept the recommended extensions (ESLint, Prettier, EditorConfig, Oxc)
npm ci                 # exact dependency versions from package-lock.json
npm run dev            # http://localhost:5173 (hot reload)
npm run build          # type-check + static site in dist/ (relative paths, works from any sub-path)
npm run preview        # serve dist/ at http://localhost:4173
npm run deploy         # build and publish dist/ to the gh-pages branch (GitHub Pages)
npm test               # end-to-end suite: builds, serves on :8795, runs tests/test3d.js in headless Chromium
```

- Debugging: **Run and Debug → "Chrome: dev server"** (start `npm run dev` first). Breakpoints in `src/*.tsx` work through source maps.
- `npm test` installs Playwright + Chromium into `tests/` on first run (~150 MB). `npm run test:vault-fps` measures vault frame times while sliding.
- `npm run images` regenerates the responsive AVIF/WebP copies and blur placeholders after you replace photos (needs Python 3 + Pillow with AVIF).
- Deploying needs push access to the repo (GitHub login or token in your Git credential helper). See [docs/DEPLOY.md](docs/DEPLOY.md).
- **Live catalogue (optional).** Copy `.env.example` to `.env.local` (dev) or `.env.production.local` (deploy) and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to read products from Supabase and enable the admin at `/admin/`. Left empty, the site uses `src/data.ts`. See [docs/ADMIN.md](docs/ADMIN.md). `npm run test:rls` and `npm run test:live` test the database rules and the live flow.
- Opening `dist/index.html` from disk (file://) will not load the 3D module; use `npm run preview` or any static server (`./start-demo.sh`, `start-demo.bat`).

## Project structure

```
index.html              logo gate markup (paints before JS), SEO meta, JSON-LD
src/
  main.tsx              React entry
  App.tsx               views/state machine, vault rail (spring), sheet, inspect, keyboard, 2D fallback
  three/Experience.tsx  the whole 3D scene: gate, storefront, walk-in, golden vault, pieces, quality tiers, GPU watchdog
  Inspect.tsx           3D turntable inspect view (2.5D garment mesh from the cut-out photo)
  Tailor.tsx            Lorenzo the host: greeting, typed line, the two choices
  Grid.tsx              Attire Tour grid with category filters
  Pic.tsx               responsive <picture> with blur placeholder, preloading, logo mark
  Rain.tsx              canvas rain + splashes on the storefront
  rig.ts                shared mutable state between DOM and 3D (timings: TRANSITION_MS, WALK_MS)
  data.ts               EDIT HERE: contact details, products, prices, logo/store paths, Lorenzo copy
  lqip.ts               generated blur placeholders
  styles.css, fonts.css, fonts/   styles and self-hosted fonts
public/                 shipped as-is: img/ (products, r/ responsive, cut/ cut-outs), brand/ (logo sizes),
                        store/, tailor/ (Lorenzo), walk/ (walk sprite atlas), favicons, robots, sitemap, CNAME
assets-src/             original/master images (logo JPG, store photos, references, generated products, Lorenzo previews, concept stills)
scripts/                deploy.sh (gh-pages), imgs.py (responsive images), asset-prep/ (one-off image prep scripts)
tests/                  Playwright end-to-end suite (test3d.js), vault fps check, vault-opening stills, Windows laptop runner (zeus/)
docs/                   DESIGN.md, ARCHITECTURE.md, DEPLOY.md, CONTENT.md
.vscode/                recommended extensions, Chrome debug launch configs, workspace settings
```

## Edit the products (`src/data.ts`)

Everything a shop owner changes is in `src/data.ts`:

- `CONTACT`: `whatsapp` (digits with country code; now `919092248282`), `phone` (`+919092248282`), `phoneLabel` (`+91 90922 48282`), `address` (the final-panel text, linked to Maps), `mapsUrl` (Google Maps location, used by the top-right **Visit the store** link, which is an icon only at ≤560px, and by the address), `bookingUrl` (empty = WhatsApp fitting request).
- `SAMPLE_PRICES`: `true` shows "sample price" labels; set `false` once real prices are in.
- `ITEMS`: one object per piece, in vault order:

```ts
{ category: 'formal',                 // 'formal' | 'wedding' | 'statement' | 'shirts' (Attire Tour filters)
  name: 'Three-piece suit', tagline: 'Cut for the long evening.',
  fabric: 'Navy Super 120s worsted wool…', price: 85000,          // INR, or null for "price on request"
  images: imgs('three-piece', 'Navy three-piece suit on a mannequin', true),  // slug, alt text, has store crop (-4)
  colours: [{ name: 'Navy', hex: '#1d2a44' }],
  details: { fit: '…', madeToMeasure: '…', delivery: '…' } }
```

- Photos for a slug live at `public/img/<slug>-1.webp` (3:4 hero, ~768×1024, used in the vault), `-2` (detail), `-3` (closer crop), `-4` (optional store-window crop). After replacing, run `npm run images`. For the 3D inspect view also add a transparent cut-out at `public/img/cut/<slug>-1.webp` (any background remover, e.g. `rembg`); without it the view uses the hero photo.
- Adding or removing an item needs no other code change; the vault, grid, counter and inspect view all read `ITEMS`.

See [docs/CONTENT.md](docs/CONTENT.md) for everything still marked PLACEHOLDER.

## Flow

1. **Gate.** Only the red logo, touch it to enter. The logo is plain HTML in `index.html`, so it paints before any script loads and never depends on WebGL. It fades in at 0.3–0.8s with a breathing red halo and film grain behind it; the prompt follows at about 1.1s. A red ring follows the cursor.
2. **Entry (2.5s, with Skip).** The logo splits into two hinged doors (CSS 3D), red light floods in behind them, and the camera dollies through the store photo as red curtains part.
3. **Storefront and Lorenzo.** The rainy night storefront fills the screen.
   - The interior lights flicker on, the neon sign glows and hums, rain falls in front and behind, drops splash on the wet floor, and the camera slowly dollies in with depth parallax.
   - Copy: "Night boutique · Bespoke tailoring", then "Dressed for the family business."
   - Lorenzo, your host, rises in at the bottom right (fedora, black pinstripe, red tie). He breathes, with rain falling in front of him.
   - His line types out: "Good morning / Good day / Good evening, sir. Shall I show you The Godfather Attire Tour, or The Godfather Premium Wardrobe?" The greeting follows the visitor's local time.
   - Two buttons: The Godfather Attire Tour (dark) and The Godfather Premium Wardrobe (red).
   - Skip or Esc shows the full line and the buttons at once.
   - The top nav (Collections, Tailoring, Visit, Private wardrobe) shows on desktop.
4. **Premium Wardrobe.** One continuous walk of about 6.4s, led by Lorenzo, with Skip and Esc:
   - The storefront rushes into the glass doors and hands over to the 3D camera inside the shop.
   - The camera walks a red runner between racks of suits under spotlights, glancing at the racks with a light head-bob.
   - Lorenzo (seen from behind, cat in his arm) walks ahead; the hidden wardrobe at the end of the shop opens and the camera takes a quick brass stairwell down (about 3.4s in total).
   - The highlight: the **palace wardrobe gate** (carved honey-wood doors with gilded rosettes and friezes, in a gilded architrave and white marble). Lorenzo, now a doorman in a tailcoat and white gloves, with one hand on the handle, the other behind his back holding the cigar, and the cat on his shoulder, unlocks it. A seam of light cracks, the doors swing inward and gold light floods out, then the camera glides through onto the first piece.
   - The camera follows one CatmullRom spline eased over time, with a wider lens while walking and depth of field (desktop). Fog and light shift from crimson to gold.
   - The vault pictures are fetched during the walk.

   In the vault:
   - brass panels, dark marble with reflections, red velvet accents
   - each piece on its own lit plinth inside a gold arch
   - the camera glides from piece to piece (swipe, drag, wheel, arrows, Home and End)
   - the piece in focus is lit, sways slowly and tilts with the pointer, while its neighbours sit back and dim
   - counter, Enquire on WhatsApp, View details, and the private visit panel at the end
   - The product pictures are HTML `<picture>` elements kept on their 3D anchors every frame, not WebGL textures. They are AVIF/WebP at 512w and 864w, with a 12×16 blurred placeholder that crossfades to the photo; the piece in focus and its two neighbours are loaded.
5. **Attire Tour.** A grid of all pieces: 2 columns at 390px, 3 from 760px, 4 from 1100px.
   - Filter chips: All, Suits and formal, Shirts, Wedding, Statement pieces.
   - A card opens the same detail sheet.
   - "Enter the premium wardrobe" goes down to the vault.
6. **Top bar:** the logo goes back to the gate, Ask the tailor goes back to Lorenzo, and Book a fitting is always there. On desktop the vault also shows "Back to the shop" and "Private wardrobe · 01".
7. **Repeat visits** in the same session skip the gate and entry and land on Lorenzo, with a shorter build-up.
8. **Reduced motion, or no WebGL:** a 2D version with plain fades and the same flow.
9. **GPU watchdog:** if the WebGL context is lost, the vault renders black, or the frame rate stays under 8 fps, the site switches to the 2D room mid-visit. The pictures stay where they are.


## Docs

- [docs/DESIGN.md](docs/DESIGN.md): palette, fonts, logo rules, scene-by-scene flow with timings, animation specs, breakpoints, accessibility, performance tiers
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): components, 3D scene, state flow, data model, URL debug flags
- [docs/DEPLOY.md](docs/DEPLOY.md): GitHub Pages, custom-domain DNS for www.thegodfatherclothings.in, canonical/meta URL switch
- [docs/ADMIN.md](docs/ADMIN.md): the live product catalogue (Supabase): using `/admin/`, schema and security, setup, tests
- [docs/CONTENT.md](docs/CONTENT.md): what to replace before launch, and the assumptions made

© The Godfather Menswear. All rights reserved.
