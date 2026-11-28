# MASTER PROMPT (paste this into a new Claude Code session opened in this folder)

Fill in the BRIEF, delete the lines you do not need, then paste everything below the line.

---

You are building a **cinematic, fluid, 3D website** on top of the starter in this folder. Read `README.md`, `CLAUDE.md`, `PERFORMANCE-RULES.md`
and the source in `src/` first (it is small), run `npm install && npm run build && npm test`, and look at the screenshots in `tests/out/` so you know the baseline.
Do not rewrite the motion or the ring: they are tuned. Extend them.

## BRIEF (fill in)
- Brand / business: [BRAND] ([what it sells], [city/country])
- Audience and mood: [e.g. premium menswear, after-hours, velvet and gold / minimal skincare, white stone and daylight / ...]
- Palette: ink [#050303], accent [#f2c46b], bone [#efe6dc]  (change the tokens at the top of `src/styles.css` and the gold in `src/three/Ring.tsx` / `Room.tsx`)
- Type: [display font], [body font]   (self-host, `font-display: swap`, preload only the first one)
- Pieces: [N] products, content in `src/content.ts` (I will give real copy; use `[PLACEHOLDER]` until then, never invent facts)
- Key action: [Buy now / Add to cart / Enquire on WhatsApp / Book a visit]
- Pages/scenes wanted: [1) entrance, 2) the ring (products), 3) product details, 4) contact/visit]

## What to build (in this order, one commit per step, show me a screenshot after each)
1. **Rebrand the baseline**: colours, fonts, copy tokens, favicon, `<title>`/description, brand mark. Keep the layout and the motion untouched.
2. **Entrance (cinematic, 3 to 5 s, skippable)**: dark first paint in HTML/CSS, then the 3D engine loads behind it. Reveal with a slow dolly-in, light coming on, text rising. No spinner. `Skip` button visible from 0 s. Respect reduced motion (cut straight to the ring).
3. **The ring**: use my real cut-outs (see `ASSET-PROMPTS.md`). Tune only `STEP`, `FADE_END`, `FIT` and the gold/bloom values to taste. A piece must always be centred in its arch whatever the cut-out looks like.
4. **Product panel**: description, spec list, option chips (size/colour: show colours ONLY if the data has them), pinned primary/secondary buttons. The photo area stays about 60% of the phone screen; the details scroll under it.
5. **Tap the piece -> inspect view**: front/back flip card, ~3/4 of the screen, minimal text, no buying options there.
6. **Optional cinematic extras** (ask me before doing): a first-person walk-through between scenes, a looping hero video behind the entrance, sound.
7. **Quality pass**: run the test suite, sweep 320/375/414/768/1440 px widths and landscape phone, keyboard only, reduced motion, WebGL disabled. Fix everything you find, list what you could not verify.

## Non-negotiables
- One gesture moves exactly one piece. The glide eases in and out and settles in ~1 s. Text cross-fades in place, never slides.
- Smooth on a mid-range phone: dpr <= 1.25 by default, cheap floor on portrait, no `backdrop-filter`, no animated `filter`, texture uploads one at a time.
- Works with no WebGL (plain scroll-snap fallback), with reduced motion, with the keyboard, on a 320 px screen and a phone held sideways.
- No horizontal page scroll at any width. Tap targets >= 44 px. Visible focus. Real alt text. Contrast >= 4.5:1 for body text.
- Content is placeholder until I supply it. Never invent names, reviews, prices, metrics or contact details.
- Explain each non-trivial change before making it if I ask for approvals; otherwise keep commits small and described.

## Definition of done
`npx tsc -p . --noEmit` clean, `npm run build` clean, `npm test` green, screenshots reviewed, a `?debug=fps` overlay available so I can send you real-phone numbers, and a short README section "How to change content, colours and the feel".
