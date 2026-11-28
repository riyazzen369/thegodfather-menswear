# Project notes (read first)

- Stack: Vite + React 19 + TypeScript + three.js via @react-three/fiber, drei, postprocessing. No other runtime dependencies without a reason.
- **Content lives only in `src/content.ts`.** Never invent client names, testimonials, metrics, prices or contact details: use `[PLACEHOLDER]`.
- Shared mutable state is `src/rig.ts` (read/written every frame, never React state). React state only for things that change a few times a minute.
- The rail (`src/rail.ts`) writes `rig.p` once per frame from the 3D frame loop (negative-priority `useFrame`, so it runs before everything is placed).
  Do not add a third smoothing stage on top; do not add momentum that can cross more than one piece.
- Every piece runs the same code in `src/three/Ring.tsx`. Each piece turns about **its own centre** (group origin = piece). Never rotate a group about a distant origin.
- Layout for phone / desktop / landscape is decided in ONE place: `src/three/world.ts` (+ the media query at the end of `styles.css`).
- Motion must degrade: `prefers-reduced-motion` (no dolly, no sway, instant moves), quality tiers (`?q=low|med|high`), WebGL failure -> 2D fallback.
- Never animate `filter` or `backdrop-filter` on moving or large layers (use opacity/transform). No `backdrop-filter` over animated content.
- Texture uploads: `gl.initTexture` one at a time, off the swipe. Photos load nearest-first after the first frame.
- Verify with: `npx tsc -p . --noEmit && npm run build && npm test`, then LOOK at `tests/out/*.png` (a passing test can still look wrong).
- Real-phone smoothness cannot be measured in software GL: ask the owner for a `?debug=fps`-style screenshot (add a tiny overlay) before tuning performance.
- Ask before changing anything the owner has already approved; explain changes first when the owner's rules say so.
