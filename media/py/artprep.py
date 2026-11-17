"""Promo v2: prepares the owl artwork (the artwork is Second Dawn's own; it stays in work/v2/art, never in a repository).
Trims the transparent margins, brings every standing pose to the same scale as owl-front (so a pose swap does not make the owl jump in size),
aligns the blink picture on the front picture, removes dark fringes from the semi-transparent edges, and writes work/v2/public/art/*.png + meta.json
(size and feet anchor of each sprite)."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).parent))
from config import WORK

SRC = WORK / "v2" / "art"
OUT = WORK / "v2" / "public" / "art"
OUT.mkdir(parents=True, exist_ok=True)

STANDING = ["owl-front", "owl-front-blink", "owl-lock", "owl-headset", "owl-magnifier", "owl-document", "owl-glasses", "owl-thumbsup", "owl-wave"]
OTHER = ["owl-fly", "laptop", "cloud", "padlock-open", "padlock-closed"]


def defringe(im: Image.Image) -> Image.Image:
    """Edge pixels of a cut-out often keep a trace of the old (dark) background: replace the colour of semi-transparent pixels by the colour
    of the nearest fully opaque pixel, so soft edges stay soft and nothing grey remains."""
    a = np.array(im.convert("RGBA"))
    alpha = a[..., 3]
    solid = alpha > 245
    idx = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    near = a[idx[0], idx[1], :3]
    edge = (alpha > 0) & (alpha <= 245)
    a[..., :3][edge] = near[edge]
    return Image.fromarray(a, "RGBA")


def bbox(im: Image.Image, thr: int = 24):
    ys, xs = np.where(np.array(im)[..., 3] > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


meta = {}
front = defringe(Image.open(SRC / "owl-front.png"))
fl, ft, fr, fb = bbox(front)
front = front.crop((fl, ft, fr, fb))
FH = front.height
for name in STANDING + OTHER:
    im = defringe(Image.open(SRC / f"{name}.png"))
    l, t, r, b = bbox(im)
    im = im.crop((l, t, r, b))
    if name in STANDING:
        s = FH / im.height                    # the same height as the front picture: the standing poses share one scale
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    else:
        s = {"owl-fly": FH * 0.9 / im.height * 1.0, "laptop": 1.0, "cloud": 1.0, "padlock-open": 1.0, "padlock-closed": 1.0}[name]
        if name == "owl-fly":
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(OUT / f"{name}.png")
    meta[name] = {"w": im.width, "h": im.height}
    print(name, im.size)
(OUT / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")

# a contact sheet to judge the match
sheet = Image.new("RGB", (1900, 1100), (11, 16, 38))
x = 10
for name in STANDING:
    im = Image.open(OUT / f"{name}.png")
    sheet.paste(im.resize((int(im.width * 0.55), int(im.height * 0.55))), (x, 20), im.resize((int(im.width * 0.55), int(im.height * 0.55))))
    x += int(im.width * 0.55) + 6
sheet.save(WORK / "art-norm-sheet.png")
