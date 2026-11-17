"""Developer helper (promo v2, photo-real 2.5D owl): cuts the public-domain snowy owl photos out of their background (rembg / U2-Net, MIT/Apache),
crops them and makes a soft depth map (an inflated silhouette plus a little tone) for the parallax mesh in Remotion.
Photos: Wikimedia Commons, public domain (U.S. Fish and Wildlife Service). Output: work/v2/public/owl25d/."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).parent))
from config import WORK

SRC = WORK / "v2" / "photos"
OUT = WORK / "v2" / "public" / "owl25d"
OUT.mkdir(parents=True, exist_ok=True)
JOBS = {"perched": "3000_Snowy_owl_54254689813.jpg", "flying": "3000_Snowy_Owl_in_flight_28995662737.jpg"}
F = 2.0   # the constants below were measured on 1500 px wide photos; these are 3000 px wide

session = new_session("u2net")
for name, f in JOBS.items():
    im = Image.open(SRC / f).convert("RGB")
    cut = remove(im, session=session, alpha_matting=True, alpha_matting_foreground_threshold=235, alpha_matting_background_threshold=15, alpha_matting_erode_size=8)
    a = np.array(cut)[..., 3]
    ys, xs = np.where(a > 40)
    pad = 40
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + pad), min(im.height, ys.max() + pad))
    cut = cut.crop(box)
    cut.save(OUT / f"{name}.png")
    alpha = np.array(cut)[..., 3] / 255.0
    dist = ndi.distance_transform_edt(alpha > 0.5)
    depth = np.sqrt(dist / max(1.0, dist.max()))                       # an inflated, rounded silhouette
    lum = np.array(cut.convert("L"), float) / 255.0
    depth = 0.8 * depth + 0.2 * ndi.gaussian_filter(lum, 6) * (alpha > 0.5)
    depth = ndi.gaussian_filter(depth, 5)
    depth = (255 * depth / depth.max()).astype(np.uint8)
    Image.fromarray(depth).save(OUT / f"{name}_depth.png")
    print(name, cut.size)


# --- the perched photo: take the power-line wire out of the owl's chest and cut the post away below its feet ---------------------------
from skimage.restoration import inpaint_biharmonic

im = Image.open(OUT / "perched.png").convert("RGBA")
arr = np.array(im).astype(float) / 255.0
h, w = arr.shape[:2]
yy, xx = np.mgrid[0:h, 0:w]
line_y = (303 - 0.0473 * (xx / F - 207)) * F
mask = (np.abs(yy - line_y) < 12 * F) & (xx > 430 * F) & (xx < 722 * F)
rgb = arr[..., :3].copy()
for c in range(3):
    pass
# clone the feather rows from 26 px above (one row period), which hides the wire better than blurring it
src_y = np.clip(yy - int(26 * F), 0, h - 1)
cloned = rgb[src_y, xx]
soft = ndi.gaussian_filter(mask.astype(float), 2.0 * F)[..., None]
arr[..., :3] = rgb * (1 - soft) + cloned * soft
a = arr[..., 3]
a[:, : int(430 * F)] = 0
a[:, int(722 * F):] = 0
fade = np.clip((395 * F - yy) / (40.0 * F), 0, 1)                     # the post below the feet fades out
a *= fade
opened = ndi.binary_opening(a > 0.5, structure=np.ones((3, 3)), iterations=int(7 * F))   # thin leftovers (the wire) disappear
a *= ndi.gaussian_filter(opened.astype(float), 1.5)
arr[..., 3] = a
out = Image.fromarray((arr * 255).astype(np.uint8), "RGBA")
ys, xs = np.where(np.array(out)[..., 3] > 30)
out = out.crop((xs.min() - 20, max(0, ys.min() - 20), xs.max() + 20, ys.max() + 10))
out.save(OUT / "perched.png")
alpha = np.array(out)[..., 3] / 255.0
dist = ndi.distance_transform_edt(alpha > 0.5)
depth = np.sqrt(dist / max(1.0, dist.max()))
lum = np.array(out.convert("L"), float) / 255.0
depth = 0.8 * depth + 0.2 * ndi.gaussian_filter(lum, 6) * (alpha > 0.5)
depth = ndi.gaussian_filter(depth, 5)
Image.fromarray((255 * depth / depth.max()).astype(np.uint8)).save(OUT / "perched_depth.png")
print("perched cleaned", out.size)
