"""Promo v2: the supplied blink picture (owl-front-blink) has different body proportions than owl-front, so a swap between them would make the owl
jump. This makes a blink from owl-front itself: the eyes are painted over with fur colour and a closed-eye lash line is drawn (same style as the supplied one)."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).parent))
from config import WORK

OUT = WORK / "v2" / "public" / "art"
im = Image.open(OUT / "owl-front.png").convert("RGBA")
a = np.array(im).astype(int)
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
amber = (al > 200) & (r > 170) & (g > 105) & (g < 200) & (b < 110) & (r - b > 90)
lab, n = ndi.label(ndi.binary_closing(amber, iterations=3))
sizes = ndi.sum(amber, lab, range(1, n + 1))
order = np.argsort(sizes)[::-1][:2]
eyes = []
for o in order:
    ys, xs = np.where(lab == o + 1)
    eyes.append((xs.mean(), ys.mean(), np.sqrt(len(xs) / np.pi)))
eyes.sort()
print("eyes (x, y, radius):", [(round(x), round(y), round(rad)) for x, y, rad in eyes])

S = 4                                           # supersampling for smooth edges
W, H = im.size
mask = Image.new("L", (W * S, H * S), 0)
lash = Image.new("L", (W * S, H * S), 0)
md, ld = ImageDraw.Draw(mask), ImageDraw.Draw(lash)
for x, y, rad in eyes:
    RX, RY = rad * 2.75, rad * 2.45              # the whole eye: the amber disc is only the middle of it (white, dark rim)
    md.ellipse(((x - RX) * S, (y - RY * 1.0) * S, (x + RX) * S, (y + RY * 1.05) * S), fill=255)
    # the closed eye: a downward curve, thicker in the middle, with a small flick at the outer corner
    w = rad * 2.2
    pts = [(x - w + t * 2 * w, y - rad * 0.55 + rad * 1.0 * (1 - ((t - 0.5) * 2) ** 2) ) for t in np.linspace(0, 1, 40)]
    th = max(4, int(rad * 0.2)) * S
    ld.line([(px * S, py * S) for px, py in pts], fill=255, width=th, joint="curve")
    for px, py in (pts[0], pts[-1]):
        ld.ellipse((px * S - th / 2, py * S - th / 2, px * S + th / 2, py * S + th / 2), fill=255)
mask = mask.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2.5))
lash = lash.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))
# fur colour: the average of the fur just around the eyes
head = (al > 200) & (np.mgrid[0:H, 0:W][0] < H * 0.3) & (a[..., :3].mean(-1) > 222)
fur = a[..., :3][head].mean(0)
fur_img = Image.new("RGBA", (W, H), (int(fur[0]), int(fur[1]), int(fur[2]), 255))
res = Image.composite(fur_img, im, mask)
dark = Image.new("RGBA", (W, H), (46, 30, 28, 255))
res = Image.composite(dark, res, lash)
res.putalpha(im.getchannel("A"))
res.save(OUT / "owl-front-blink.png")
print("blink made", res.size)
