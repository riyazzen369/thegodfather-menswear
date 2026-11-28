# Rules that make it feel expensive and run on a phone

Learned the hard way on a production storefront. Break these only with a measurement.

## Motion feel
1. **Ease in AND out.** One critically damped spring starts at full speed (a jolt). Two in a row (target -> q -> p, 10 rad/s each) start soft and settle in ~1 s with no overshoot. See `rail.ts`.
2. **One gesture = one piece.** Cap the fling velocity and decide the target from distance/velocity thresholds, never from momentum. A hard flick that rounds three pieces feels broken.
3. **Calm the finger**: the piece trails the finger at ~0.8x, not 1x. Responsive-but-twitchy reads as cheap.
4. **Don't stack smoothing**: rail spring + camera lerp + CSS transition = mush and lag. The camera follows the rail almost rigidly (`exp(-dt * 24)`).
5. **Hide neighbours at rest, orbit them in while moving** (`ringFade`). A neighbour sitting beside the focused piece looks like a slider, not an orbit.
6. **Text cross-fades in place**; it never slides sideways half-cut across the screen. Stagger its arrival ~0.07 s per line, fast exit (0.18 s).
7. **The ring pivot**: rotate each piece about its own centre. Rotating a group about a faraway origin (the world origin 10 units behind) flings turned pieces sideways. (This single bug made a "360 orbit" not look like an orbit for weeks.)

## Frame budget
8. **Quality tiers** (`low`: dpr 1, no bloom; `med`: dpr 1.25; `high`: 1.75) driven by drei `PerformanceMonitor`, with a pin (`?q=`) for testing. Never rebuild the post chain while something moves.
9. **Don't pay for what can't be seen**: portrait phones use a plain floor (a mirror floor re-renders the whole scene and sits under the text panel).
10. **Compile shaders early**: `renderer.compileAsync(scene, camera)` once while the visitor is reading, not on the first frame of a scene. Make hidden objects visible for that call, then restore.
11. **Upload textures one per timer tick** (`gl.initTexture`), nearest piece first, never mid-swipe, never all at once at scene start. Downscale big cut-outs to 768 px wide before upload (a 1200x1600 RGBA texture is ~30 MB of GPU memory with mipmaps).
12. **DOM that moves must be cheap**: animate `transform`/`opacity` only. Never animate `filter`; never put `backdrop-filter` over moving content (it re-blurs every frame). Batch canvas strokes (2D rain/particles) into a few paths, lower their dpr.
13. **One writer per element per frame.** Two code paths placing the same DOM element (a 3D frame and a rAF loop) fight and flicker.
14. **Layout reads are expensive**: measure once per resize, not per render/frame; measure untransformed (a transformed element reports the wrong box).

## Assets
15. Cut-outs: 3:4, transparent, subject standing on the bottom edge, 1200x1600 PNG/WebP master, ship 768x1024 WebP. Auto-framing (`fitSubject`) handles size and position, so do not hand-tune each image.
16. Plated (opaque) photos are left exactly as they are by the auto-framing; only real alpha is reframed.
17. Videos: H.264 MP4 (+ WebM), 1080p max, 24 fps, no audio unless needed, `playsinline muted loop`, poster frame, lazy start after first paint, <= 3 MB for a hero loop.

## Safety nets (all required)
18. WebGL missing or context lost -> plain 2D carousel. 19. `prefers-reduced-motion` -> no dolly/sway, instant moves. 20. Keyboard (arrows), visible focus, `inert` on anything hidden.
21. Phone held sideways: use the desktop arrangement. 22. No horizontal overflow at 320 px.

## How to test
- Software GL (SwiftShader) is deterministic but slow: use it for correctness and screenshots, never for judging smoothness.
- Judge smoothness only on a real phone: add a tiny fps overlay (`?debug=fps`) showing fps, tier and dpr, and ask for a screenshot.
- Always LOOK at the screenshots. A passing test can still look wrong (a piece 90 px off-centre passed every check once).
