# The Godfather Menswear — cinematic 3D site

Live: https://riyazzen369.github.io/thegodfather-menswear/ · domain (once DNS points to GitHub): https://www.thegodfatherclothings.in/

React + Three.js (react-three-fiber), mobile first (390px up to 1440px), in the red-and-black look of the store photo,
with the store's real logo.

## Run

```bash
npm i
npm run dev            # http://localhost:5173
npm run build          # static site in dist/ (relative paths, works from any folder or sub-path)
./start-demo.sh        # serves dist/ on http://localhost:8080 and opens the browser (start-demo.bat on Windows)
```

Use a static server for dist/. Opening `index.html` straight from disk (file://) won't load the 3D module.

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
4. **Premium Wardrobe.** One continuous first-person walk of 9s, with Skip and Esc:
   - The storefront rushes into the glass doors and hands over to the 3D camera inside the shop.
   - The camera walks a red runner between racks of suits under spotlights, glancing at the racks with a light head-bob.
   - The hidden wardrobe at the end of the shop opens on gold light, and the camera steps through and down a brass stairwell with lit steps.
   - It glides out onto the first anchor in the **golden vault**, and the first piece lights up on its plinth.
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

## Replace before going live (`src/data.ts`)

- `CONTACT.whatsapp` (digits with country code), `phone`, `phoneLabel`, `address`, and optionally `bookingUrl`
- `ITEMS[].price`: the prices are samples; set `SAMPLE_PRICES = false` once real prices are in
- Copy, colours and `category` for each piece
- Real product photos: `public/img/<slug>-1..4.webp` (`-1` is the 3:4 hero, about 768×1024)
- A vector or PNG master of the logo if one exists (`public/brand/`). The current logo is cut out of the supplied JPG.

## Images

- **Store photo:** the storefront hero and the entry. Crops from it are used for the suit, velvet blazer and animal-print shirts (`-4`).
- **Generated, per piece:** a hero (`-1`) and a detail close-up (`-2`) for all 12 pieces. `-3` is a tighter crop of the hero.
- **Generated, other:** Lorenzo (`public/tailor/lorenzo.webp`) and the velvet curtain.
- **Built in code:** the vault, the shop interior, racks, stairwell, the doors, the rain, the slats and the wardrobe.
- **Responsive copies:** `public/img/r/` (AVIF + WebP, 512w and full) and `src/lqip.ts` (placeholders) are generated by `python3 scripts/imgs.py` (needs Pillow with AVIF); logo sizes `public/brand/logo-160/240/320/800.webp` too. Re-run it after replacing photos.

## Domain and SEO

- `public/CNAME`: www.thegodfatherclothings.in
- Also in `public/`: `.nojekyll`, `robots.txt`, `sitemap.xml`, `site.webmanifest`, favicons and `og-image.jpg`
- In `index.html`: the canonical URL, Open Graph and Twitter tags, and JSON-LD
- Fonts are self-hosted, so the site does not depend on Google Fonts at runtime

## Deploy (GitHub Pages)

1. Run `npm run build`.
2. Publish `dist/` to the `gh-pages` branch. Pages source: `gh-pages`, folder `/`.
3. Add these DNS records at the registrar for thegodfatherclothings.in:

   | Type  | Host       | Value                                                                  |
   |-------|------------|------------------------------------------------------------------------|
   | CNAME | www        | riyazzen369.github.io                                                  |
   | A     | @ (apex)   | 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153     |
   | AAAA  | @ (apex)   | 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153 |

4. In the repo, open Settings → Pages and set the custom domain to `www.thegodfatherclothings.in`.
5. Once the DNS check passes and the certificate is issued (minutes to a few hours), tick **Enforce HTTPS**.

## Debug

- `?2d`: force the 2D version
- `?freeze=1.3`: hold the entry at 1.3s
- `?wfreeze=4.2`: hold the premium walk at 4.2s
- `?force3d`: never fall back to 2D for low frame rate (software GL in tests)
- `?hq`: never drop to the low-quality mode
- `?q=low|med|high`: force a quality level (low: pixel ratio 1, plain floor, no depth of field; med: pixel ratio up to 1.25, half-resolution reflections, no depth of field; high: pixel ratio up to 1.75, full reflections and depth of field). Without it the site starts high and drops to low if the frame rate declines.
- `?debug=fps`: an overlay with fps (and the minimum), the mode, quality level, pixel ratio, view and the watchdog reading. Combine them, for example `?debug=fps&q=med`.
- `window.__glHealth`: the GPU watchdog's last reading
- `window.__rig`: shared state
- `window.__fps`: frame rate
