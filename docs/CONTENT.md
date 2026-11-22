# Content to replace, and assumptions

Everything marked `PLACEHOLDER` in `src/data.ts` must be replaced before launch.

## Replace

| Item | Where | Notes |
|---|---|---|
| WhatsApp number | `CONTACT.whatsapp` in `src/data.ts` | **set: `919092248282`** (digits only with country code); used for every "Enquire on WhatsApp" and fitting request |
| Phone | `CONTACT.phone`, `CONTACT.phoneLabel` | **set: `+919092248282` / `+91 90922 48282`**; `tel:` link + display text |
| Store location | `CONTACT.mapsUrl` | **set: https://maps.app.goo.gl/PU97R3Jrgu9qmCty8**; top-right "Visit the store" link (icon only at ≤560px) and the final-panel address link |
| Address | `CONTACT.address` | currently "Get directions on Google Maps" (links to `mapsUrl`); replace with the street address when known, and add it to the JSON-LD `address` in `index.html` |
| Booking URL | `CONTACT.bookingUrl` | "Book a fitting"; empty = WhatsApp fitting request |
| Prices | `ITEMS[].price` (INR, `null` = on request) and `SAMPLE_PRICES` | all current prices are samples; set `SAMPLE_PRICES = false` to drop the "sample price" label |
| Product photos | `public/img/<slug>-1..4.webp` | `-1` 3:4 hero ~768×1024 (vault + grid), `-2` detail, `-3` closer crop, `-4` store-window crop (optional). Then run `npm run images` |
| 3D inspect cut-outs | `public/img/cut/<slug>-1.webp` | transparent PNG/WebP of the garment (e.g. `rembg -m isnet-general-use`), ~680px tall |
| Copy | `ITEMS[].name/tagline/fabric/details/colours`, `TAILOR`, `HOST` | piece names, Lorenzo's lines |
| Logo | `public/brand/` | the current logo is cut from a JPG (`assets-src/brand/logo.jpg`). Replace it with a vector/PNG master if the store has one, keep the file names, then `npm run images` |
| Store photo | `public/store/store-1280.webp`, `store-1920.webp` | master: `assets-src/store/storefront.png` |
| Social image | `public/og-image.jpg` | 1200×630 |
| Domain/canonical | see `docs/DEPLOY.md` | |

## Assumptions made

- The store's name and look come from its photo, logo and Instagram reel: a red neon logo on black, with a red-and-black interior and red curtains.
- The 12 pieces, names, fabrics, colours and prices are illustrative. The product images are AI-generated (`source: 'generated'`), except the `-4` crops, which come from the real store photo.
- Lorenzo (the host), his cat, the cigar, the walk cycle and the velvet curtain are generated imagery. The shop interior, stairwell, golden vault and doors are built in code.
- Contact is by WhatsApp first. There's no cart or checkout and no backend: the site is fully static, and enquiries open WhatsApp with a prefilled message.
- The greeting follows the visitor's local time (morning/day/evening).
- Currency is INR, and the language is English (India).

## Source assets (`assets-src/`)

| Folder | Contents |
|---|---|
| `brand/` | original logo JPG and the square crop |
| `store/` | storefront photo (PNG master + JPG variants) and the generated HD store variants (collection, animal print) |
| `reference/` | look-and-feel references: hero/suit/blazer/animal reference crops and stills from the store's Instagram reel |
| `products/` | generated product originals (8 pieces × 4 views) and the store-photo crops |
| `lorenzo/` | Lorenzo figure previews, the hand/key study, and `lorenzo-doorman.jpg` (the generated doorman pose used at the wardrobe gate). The published, keyed Lorenzo and walk atlas are at full working resolution in `public/tailor/` and `public/walk/` |
| `concept-stills/` | early concept frames (landing host, door opening, bunker wardrobe, shirt showcase) |

The one-off image prep scripts are in `scripts/asset-prep/`. The responsive image pipeline is `scripts/imgs.py`.
