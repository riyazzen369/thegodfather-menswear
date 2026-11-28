"""Generates four transparent 3:4 placeholder cut-outs (public/placeholders/piece-N.png) so the starter runs with no assets.
Piece 2 is deliberately small and off-centre: the scene's auto-framing must still put it in the arch. Replace with real cut-outs
(see ASSET-PROMPTS.md). Needs Pillow:  pip install pillow"""
from PIL import Image, ImageDraw, ImageFilter
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'placeholders'); os.makedirs(OUT, exist_ok=True)
W, H = 768, 1024

def shape(points, base, light):
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(points, fill=255); m = m.filter(ImageFilter.GaussianBlur(1.2))
    g = Image.new('RGBA', (W, H)); px = g.load()
    for y in range(H):
        for x in range(W):
            t = 0.5 + 0.5 * ((x / W) * 0.7 - (y / H) * 0.3)
            px[x, y] = tuple(int(base[i] + (light[i] - base[i]) * max(0, min(1, t))) for i in range(3)) + (255,)
    g.putalpha(m); return g

def tee(c1, c2, s=1.0, ox=0, oy=0):
    P = [(260, 150), (330, 120), (384, 150), (438, 120), (508, 150), (640, 260), (580, 340), (520, 300), (520, 820), (248, 820), (248, 300), (188, 340), (128, 260)]
    cx, cy = W / 2, 820
    return shape([(cx + (x - cx) * s + ox, cy + (y - cy) * s + oy) for x, y in P], c1, c2)

def coat(c1, c2):
    # a long coat: shoulders, sleeves hanging, a straight body, a V at the neck
    P = [(300, 130), (384, 175), (468, 130), (560, 160), (640, 300), (660, 760), (590, 770), (560, 400), (540, 900), (228, 900), (208, 400), (178, 770), (108, 760), (128, 300), (208, 160)]
    return shape(P, c1, c2)

def trousers(c1, c2):
    P = [(240, 160), (528, 160), (560, 940), (420, 940), (384, 420), (348, 940), (208, 940)]
    return shape(P, c1, c2)

items = [tee((28, 30, 44), (74, 78, 104)), tee((120, 24, 36), (190, 70, 84), s=0.55, ox=150, oy=-40), coat((92, 66, 42), (176, 140, 98)), trousers((20, 26, 38), (58, 70, 96))]
for i, im in enumerate(items, 1):
    im.save(os.path.join(OUT, f'piece-{i}.png'), optimize=True)
print('wrote', len(items), 'placeholders to', os.path.normpath(OUT))
