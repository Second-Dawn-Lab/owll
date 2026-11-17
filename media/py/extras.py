"""The README GIF/WebP and the YouTube thumbnail, made from the same clips and storyboard as the videos."""
from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

import render
from config import CLIPS, FFMPEG, OUT, OWLL, PURPLE
from render import FPS, Layout, ease, font, gradient, logo, paste_alpha, rounded, shadowed, text_block

DOCS_IMAGES = OWLL / "docs" / "images"


def make_gif(storyboard: dict, width: int = 800, fps: int = 15, fade_s: float = 0.6, max_mb: float = 8.0) -> list[Path]:
    """A seamless loop of the segments listed under "gif" in the storyboard, ~800 px wide, under max_mb."""
    cfg = storyboard["gif"]
    lay = Layout("16x9")
    step = FPS // fps
    height = int(width * 9 / 16)
    frames: list[Image.Image] = []
    for seg in cfg["segments"]:
        scene = {"type": "clip", "clip": seg["clip"], "ranges": seg["ranges"], "focus": seg["focus"]}  # no caption in the GIF
        dur = sum((b - a) / sp for a, b, sp in seg["ranges"])
        for k, im in enumerate(render.scene_frames(scene, lay, False, dur, seg["ranges"])):
            if k % step == 0:
                frames.append(im.resize((width, height), Image.LANCZOS))
    f = int(fade_s * fps)
    out = frames[f:]
    for i in range(f):  # the last frames melt into the first ones, so the loop has no jump
        out[len(out) - f + i] = Image.blend(frames[len(frames) - f + i], frames[i], (i + 1) / (f + 1))
    results = []
    for kind in ("gif", "webp"):
        path = DOCS_IMAGES / f"demo.{kind}" if cfg.get("to_docs", True) else OUT / f"demo.{kind}"
        path.parent.mkdir(parents=True, exist_ok=True)
        if kind == "gif":
            vf = "split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"
            codec = ["-vf", vf, "-loop", "0"]
        else:
            codec = ["-c:v", "libwebp_anim", "-lossless", "0", "-q:v", "62", "-loop", "0", "-compression_level", "6"]
        p = subprocess.Popen([str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}",
                              "-r", str(fps), "-i", "-", *codec, str(path)], stdin=subprocess.PIPE)
        for im in out:
            p.stdin.write(im.convert("RGB").tobytes())
        p.stdin.close()
        p.wait()
        mb = path.stat().st_size / 1e6
        print(f"  {path.name}: {len(out) / fps:.1f}s, {mb:.1f} MB")
        results.append(path)
    gif = results[0]
    if gif.stat().st_size > max_mb * 1e6:
        print(f"  WARNING: {gif.name} is over {max_mb} MB; lower the width or the duration in the storyboard")
    return results


def make_thumbnail(storyboard: dict) -> Path:
    cfg = storyboard["thumbnail"]
    W, H = 1280, 720
    img = gradient(W, H, (38, 16, 98), (109, 46, 240), 0.6).convert("RGBA")
    clip = CLIPS / f"{cfg['clip']}.mp4"
    shot = OUT.parent / "work" / "thumb-frame.png"
    subprocess.run([str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-ss", str(cfg["at"]), "-i", str(clip), "-frames:v", "1", str(shot)], check=True)
    src = Image.open(shot).convert("RGB")
    l, t, r, b = cfg["rect"]
    crop = src.crop((l, t, r, b))
    card_w = 600
    if card_w * (b - t) / (r - l) > 610:  # a tall picture (the meeting): limit the height instead
        card_w = int(610 * (r - l) / (b - t))
    card = crop.resize((card_w, int(card_w * (b - t) / (r - l))), Image.LANCZOS)
    card = shadowed(rounded(card, 22), blur=22, offset=12)
    img.alpha_composite(card, (W - card.width + 20, (H - card.height) // 2 + 30))
    paste_alpha(img, logo(110), (60, 70))
    title = text_block(cfg["title"], 66, (255, 255, 255), 520, align="left")
    paste_alpha(img, title, (60, 220))
    sub = text_block(cfg["sub"], 34, (225, 215, 255), 520, bold=False, align="left")
    paste_alpha(img, sub, (60, 220 + title.height + 20))
    path = OUT / "owll-thumbnail.png"
    img.convert("RGB").save(path, optimize=True)
    print(f"  {path.name}: 1280x720, {path.stat().st_size / 1e3:.0f} KB")
    return path
