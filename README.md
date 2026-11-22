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

1. **Gate.** Only the red neon logo; touch it to enter. It breathes, follows the pointer or gyro, and a red ring follows the cursor.
2. **Entry (2.5s, with Skip).** The logo splits into hinged 3D doors, red light floods in, and the camera dollies through the store photo as red curtains part.
3. **Storefront and Lorenzo.** The rainy night storefront fills the screen.
   - The interior lights flicker on, the neon sign glows and hums, rain falls in front and behind, drops splash on the wet floor, and the camera slowly dollies in with depth parallax.
   - Copy: "Night boutique · Bespoke tailoring", then "Dressed for the family business."
   - Lorenzo, your host, rises in at the bottom right (fedora, black pinstripe, red tie). He breathes, with rain falling in front of him.
   - His line types out: "Good morning / Good day / Good evening, sir. Shall I show you The Godfather Attire Tour, or The Godfather Premium Wardrobe?" The greeting follows the visitor's local time.
   - Two buttons: The Godfather Attire Tour (dark) and The Godfather Premium Wardrobe (red).
   - Skip or Esc shows the full line and the buttons at once.
   - The top nav (Collections, Tailoring, Visit, Private wardrobe) shows on desktop.
4. **Premium Wardrobe.** The camera rushes through the glass doors with motion blur, past red and black wooden slats, into a private room with velvet curtains. The wardrobe doors slide open on gold light, and the camera descends into the **golden vault**:
   - brass panels, dark marble with reflections, red velvet accents
   - each piece on its own lit plinth inside a gold arch
   - the camera glides from piece to piece (swipe, drag, wheel, arrows, Home and End)
   - the piece in focus is lit, turns slowly and comes forward, while its neighbours sit back and dim
   - counter, Enquire on WhatsApp, View details, and the private visit panel at the end
5. **Attire Tour.** A grid of all pieces: 2 columns at 390px, 3 from 760px, 4 from 1100px.
   - Filter chips: All, Suits and formal, Shirts, Wedding, Statement pieces.
   - A card opens the same detail sheet.
   - "Enter the premium wardrobe" goes down to the vault.
6. **Top bar:** the logo goes back to the gate, Ask the tailor goes back to Lorenzo, and Book a fitting is always there. On desktop the vault also shows "Back to the shop" and "Private wardrobe · 01".
7. **Repeat visits** in the same session skip the gate and entry and land on Lorenzo, with a shorter build-up.
8. **Reduced motion, or no WebGL:** a 2D version with plain fades and the same flow.

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
- **Built in code:** the vault, the doors, the rain, the slats and the wardrobe.

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
- `window.__rig`: shared state
- `window.__fps`: frame rate
