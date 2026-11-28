# Asset prompt pack (images, video, textures)

Written for any image/video generator (Midjourney, Flux, Imagen, Ideogram, Firefly, Runway, Kling, Veo, Luma, Sora). Replace the [SLOTS].
Generate in batches of 4, pick the best, keep the seed/prompt in `assets-src/NOTES.md`. **Never use real people's faces or real brand logos** unless you own the rights.

## 0. Look bible (paste before every prompt to keep the set consistent)
`[BRAND MOOD, e.g. "private after-hours tailor, deep burgundy velvet curtains, brushed brass, warm tungsten key light, dark moody room, cinematic, shallow depth of field, 35mm, subtle film grain"] — palette: ink #050303, gold #f2c46b, wine #4a1d2e, bone #efe6dc.`

## 1. Product cut-outs (the most important asset)
Spec: **3:4, 1200x1600, transparent PNG/WebP, product standing on the bottom edge, whole product visible, no cropped limbs**. The scene auto-centres and resizes the subject, so framing only needs to be "complete product, front-on".

Prompt (ghost-mannequin style, no person):
`Professional e-commerce photo of a [PRODUCT, e.g. navy three-piece suit] on an invisible ghost mannequin, perfectly front-on, centred, full product visible head to hem, soft even studio light with a gentle warm rim light, true-to-life fabric texture and stitching, plain flat light grey background, no props, no text, no shadow on the floor, 3:4 portrait, ultra sharp`

Prompt (on a model, only if you have rights/consent for a real model; otherwise use a faceless mannequin):
`Full-length front-on photo of a [faceless mannequin / model] wearing [PRODUCT], standing straight, arms relaxed, plain flat light grey seamless background, even studio light, sharp fabric detail, 3:4 portrait`

Back view (for the flip card): same prompt with `seen from directly behind, same lighting, same framing`.

Negative prompt: `text, watermark, logo, brand label, extra limbs, cropped, motion blur, harsh shadow, busy background, reflections, mirror`

Then remove the background (any of: remove.bg, Photoshop "Remove background", `rembg`, `@imgly/background-removal` in the browser) and export:
```bash
# master (keep) + shipped copy
cwebp -q 90 -alpha_q 100 piece-1.png -o public/img/piece-1-full.webp
convert piece-1.png -resize 768x1024 -define webp:alpha-quality=100 public/img/piece-1.webp   # ImageMagick
```
Check each cut-out on the dark background: no light halo around the edge (if there is: erode the mask by 1 px).

## 2. Hero / entrance stills
- Entrance plate (shop front, night): `Wide cinematic still of the front of a [BUSINESS] shop at night, rain on the street, warm light spilling from the door, neon sign reading "[BRAND]" (blank sign if the generator cannot spell), shallow depth of field, anamorphic flare, moody, 16:9, no people`
- Interior plate: `Interior of a luxury [BUSINESS], long aisle leading to an arched doorway glowing gold, burgundy velvet curtains, brass rails, dark marble floor with reflections, symmetrical one-point perspective, cinematic, no people`
- Arch niche backdrop (if you replace the shader arch): `Empty arched niche in a dark wall, gold trim, soft spotlight from above, velvet curtain behind, centred, symmetrical, 3:4`

## 3. Seamless textures (optional, for floors and walls)
`Seamless tileable [dark marble with fine gold veins / brushed brass / burgundy velvet] texture, top-down, even lighting, 2048x2048, no seams, no objects` (generate, then make seamless with a tile test).

## 4. Video (3 clips cover a whole site)
General video rules: 24 fps, 1080p, 5 to 10 s, **no text in the video**, no cuts, slow camera, subtle motion, loop-friendly where marked.

- **Hero loop (6 s, seamless)**: `Slow cinematic push-in on [the shop window / a velvet curtain with a spotlight], dust motes drifting in a warm light beam, curtains breathing very slightly, locked-off camera with a 3% dolly, shallow depth of field, moody, loopable`
- **Walk-through (8 to 10 s)**: `First-person slow walk through a luxury [BUSINESS], past rails of garments toward a glowing gold arched doorway, then descending a few marble stairs into a golden vault, steady cam, warm tungsten light, cinematic, no people`
- **Product turntable (6 s, per hero product)**: `[PRODUCT] on a ghost mannequin rotating slowly 360 degrees on a dark plinth, warm rim light, black background, steady camera, seamless loop`

Negative: `text, subtitles, watermark, logo, people's faces, jump cuts, fast motion, shaky camera, flicker`

Optimise (hero loop example):
```bash
ffmpeg -i hero.mp4 -vf "scale=1920:-2,fps=24" -an -c:v libx264 -crf 24 -preset slow -movflags +faststart public/video/hero.mp4
ffmpeg -i hero.mp4 -vf "scale=1920:-2,fps=24" -an -c:v libvpx-vp9 -crf 34 -b:v 0 public/video/hero.webm
ffmpeg -i hero.mp4 -frames:v 1 -vf "scale=1280:-2" public/video/hero-poster.webp
```
HTML: `<video autoplay muted loop playsinline preload="none" poster="/video/hero-poster.webp">` with a `<source>` for webm then mp4. Start it only after the first paint.

## 5. Logo / brand mark
`Minimal vector wordmark "[BRAND]", [serif / slab / script] letters, [gold on black], clean edges, centred, flat, no gradients` -> vectorise (Illustrator "Image Trace" / vectorizer.ai), export SVG + 512 and 1024 PNG with transparency. Also a 1200x630 share image and a 512 maskable icon.

## 6. Naming and folders
```
public/img/piece-<n>.webp          front cut-out (768x1024)
public/img/piece-<n>-back.webp     back cut-out
public/img/r/…                     smaller 512 px copies if you serve responsive sizes
public/video/hero.{mp4,webm}, hero-poster.webp
assets-src/                        masters + prompts (NOT shipped)
```

## 7. Quick filled example (menswear, after-hours tailor)
Look bible: `private after-hours tailor, deep burgundy velvet curtains, brushed brass, warm tungsten light, rain-soaked night street outside, cinematic, 35mm, film grain`.
Pieces: navy three-piece suit, burgundy velvet blazer, black tuxedo, camel overcoat — each as ghost-mannequin cut-out + back view; entrance plate = shop front at night; walk-through video = aisle to the gold arch.
