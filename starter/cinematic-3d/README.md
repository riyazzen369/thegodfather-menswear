# Cinematic 3D Starter

A small, working React + three.js project that already has the hard part solved: a **fluid 360° ring of products** you swipe through, with a gold arch,
auto-framed cut-out photos, a text panel that scrolls under the piece, a pinned call-to-action, adaptive quality, and a plain fallback if 3D fails.
It was distilled from a real production storefront, including every bug that cost us days. Start here instead of from a blank page.

## Use it in 3 steps (new Claude Code session)

1. Copy this folder somewhere new (or `git clone` the repo and `cd starter/cinematic-3d`).
2. Open Claude Code in the folder and paste **`MASTER-PROMPT.md`** (fill in the brand brief at the top).
3. Generate your images and videos with **`ASSET-PROMPTS.md`**, drop them in `public/`, list them in `src/content.ts`.

```bash
npm install
npm run dev          # http://localhost:5173  (add ?q=low|med|high to pin a quality tier, ?2d to see the fallback)
npm run build && npm test   # smoke test: swipe, flick, overflow, errors, screenshots in tests/out/
```

## What is in the box

| File | What it does |
|---|---|
| `src/content.ts` | **All content.** Pieces, prices, specs. Replace the `[PLACEHOLDER]` text and image paths. |
| `src/rig.ts` | Shared state + the **ring maths** (`ringAt`, `ringFade`, `STEP`). Tune the orbit here. |
| `src/rail.ts` | The **motion**: two critically damped springs, one gesture = one piece, capped fling, wheel, keys. Tune the feel here. |
| `src/three/Ring.tsx` | One piece on the ring: gold arch shader, photo plane, **auto-framing of any cut-out**, plinth. |
| `src/three/Scene.tsx` | Canvas, quality tiers, post-processing, GPU-failure fallback. |
| `src/three/CameraRig.tsx` | Camera follow, parallax, entrance dolly. |
| `src/three/Room.tsx` | Backdrop glow and dust. |
| `src/three/world.ts` | One place that decides piece size and screen position for phone / desktop / landscape. |
| `src/App.tsx`, `src/styles.css` | The page: panel, pinned CTA, counter, arrows, fallback. |
| `ASSET-PROMPTS.md` | Prompts and specs for images, video and textures. |
| `PERFORMANCE-RULES.md` | The rules that make it feel expensive and run on a phone. Read before changing motion. |
| `MASTER-PROMPT.md` | The paste-ready build prompt. |

## The feel, in one paragraph

Neighbours are **hidden at rest** (a single piece centred in its arch) and **orbit in** only while you move. A swipe always moves exactly one piece, however hard the flick.
The glide **eases in and out** (two springs in a row) and settles in about a second with no overshoot. Text stays put and cross-fades instead of sliding.
Everything the GPU draws is one pass of cheap planes and one small shader; the expensive effects are off or reduced on weak devices.
