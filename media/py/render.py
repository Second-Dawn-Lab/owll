"""Renders the final videos from the recorded clips with a small frame compositor:
ffmpeg decodes a trimmed clip to raw frames, Pillow crops/zooms/overlays each frame, ffmpeg encodes the result.
(No video editor, no Remotion: nothing but ffmpeg, Pillow and numpy, all pinned.)"""
from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from config import BRAND, CLIPS, FFMPEG, FONT, FONT_BOLD, FONT_SEMI, INK, MEDIA, OUT, PURPLE, PURPLE_DARK, REC_H, REC_W, WORK

FPS = 30
FORMATS = {"16x9": (1920, 1080), "9x16": (1080, 1920), "1x1": (1080, 1080)}
_fonts: dict = {}


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    k = (path, size)
    if k not in _fonts:
        _fonts[k] = ImageFont.truetype(path, size)
    return _fonts[k]


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


# --- text -------------------------------------------------------------------------------------------------------------
def wrap(text: str, fnt: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    lines: list[str] = []
    for para in text.split("\n"):
        cur = ""
        for word in para.split():
            trial = (cur + " " + word).strip()
            if fnt.getlength(trial) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = word
        lines.append(cur)
    return lines


def text_block(text: str, size: int, color=(255, 255, 255), max_w: int = 900, bold: bool = True, align: str = "center", spacing: float = 1.18) -> Image.Image:
    fnt = font(FONT_BOLD if bold else FONT, size)
    lines = wrap(text, fnt, max_w)
    lh = int(size * spacing)
    w = int(max(fnt.getlength(l) for l in lines)) + 8
    img = Image.new("RGBA", (w, lh * len(lines) + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        x = {"center": (w - fnt.getlength(l)) / 2, "left": 4, "right": w - fnt.getlength(l) - 4}[align]
        d.text((x, i * lh + 2), l, font=fnt, fill=color)
    return img


def pill(text: str, size: int, max_w: int, fg=(255, 255, 255), bg=(28, 27, 34, 215), pad: int | None = None) -> Image.Image:
    pad = pad or int(size * 0.55)
    block = text_block(text, size, fg, max_w - 2 * pad, bold=False)
    fnt = font(FONT_SEMI, size)
    lines = wrap(text, fnt, max_w - 2 * pad)
    lh = int(size * 1.22)
    w = int(max(fnt.getlength(l) for l in lines)) + 2 * pad
    h = lh * len(lines) + int(pad * 1.1)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=int(h * 0.3) if len(lines) == 1 else int(size * 0.7), fill=bg)
    for i, l in enumerate(lines):
        d.text(((w - fnt.getlength(l)) / 2, pad * 0.52 + i * lh), l, font=fnt, fill=fg)
    return img


def paste_alpha(base: Image.Image, overlay: Image.Image, xy: tuple[int, int], opacity: float = 1.0) -> None:
    if opacity <= 0:
        return
    if opacity < 1:
        a = overlay.getchannel("A").point(lambda v: int(v * opacity))
        overlay = overlay.copy()
        overlay.putalpha(a)
    base.paste(overlay, xy, overlay)


def gradient(w: int, h: int, c0=PURPLE_DARK, c1=PURPLE, angle: float = 0.0) -> Image.Image:
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    t = np.clip(y * math.cos(angle) + x * math.sin(angle), 0, 1)
    arr = np.stack([c0[i] + (c1[i] - c0[i]) * t for i in range(3)], axis=-1).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def rounded(img: Image.Image, radius: int) -> Image.Image:
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(m)
    return out


def shadowed(card: Image.Image, blur: int = 28, offset: int = 14, alpha: int = 110) -> Image.Image:
    pad = blur * 3
    out = Image.new("RGBA", (card.width + pad * 2, card.height + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", card.size, (0, 0, 0, alpha))
    sh.putalpha(card.getchannel("A").point(lambda v: int(v * alpha / 255)))
    out.paste(sh, (pad, pad + offset), sh)
    out = out.filter(ImageFilter.GaussianBlur(blur))
    out.paste(card, (pad, pad), card)
    return out


_icon: Image.Image | None = None


def logo(size: int) -> Image.Image:
    global _icon
    if _icon is None:
        _icon = Image.open(BRAND / "Owl-L_app_icon.png").convert("RGBA")
    return _icon.resize((size, size), Image.LANCZOS)


# --- camera -----------------------------------------------------------------------------------------------------------
def fit_rect(rect, aspect: float, pad: float = 1.0) -> tuple[float, float, float, float]:
    """The smallest rectangle with the target aspect that contains rect (scaled by pad), inside the recorded region."""
    l, t, r, b = rect
    cx, cy, w, h = (l + r) / 2, (t + b) / 2, (r - l) * pad, (b - t) * pad
    if w / h < aspect:
        w = h * aspect
    else:
        h = w / aspect
    if w > REC_W:
        w, h = REC_W, REC_W / aspect
    if h > REC_H:
        h, w = REC_H, REC_H * aspect
    cx = min(max(cx, w / 2), REC_W - w / 2)
    cy = min(max(cy, h / 2), REC_H - h / 2)
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


class Camera:
    """Keyframes (output seconds, rect in recorded-region pixels); eased moves between them."""

    def __init__(self, keys: list[tuple[float, tuple[float, float, float, float]]]):
        self.keys = sorted(keys, key=lambda k: k[0])

    def at(self, t: float):
        ks = self.keys
        if t <= ks[0][0]:
            return ks[0][1]
        for (t0, r0), (t1, r1) in zip(ks, ks[1:]):
            if t <= t1:
                e = ease((t - t0) / max(1e-6, t1 - t0))
                return tuple(lerp(a, b, e) for a, b in zip(r0, r1))
        return ks[-1][1]


# --- scenes -----------------------------------------------------------------------------------------------------------
def load_marks(clip: str) -> dict:
    p = CLIPS / f"{clip}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"marks": []}


def read_frames(clip: Path, start: float, dur: float, speed: float):
    """Yields RGB frames (REC_H x REC_W x 3 uint8) at FPS for [start, start+dur) of the clip, played at `speed`."""
    cmd = [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(clip),
           "-vf", f"setpts=PTS/{speed},fps={FPS}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = REC_W * REC_H * 3
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n:
            break
        yield np.frombuffer(buf, np.uint8).reshape(REC_H, REC_W, 3)
    p.wait()


def resolve_rect(spec, marks: list[dict]):
    if isinstance(spec, str):  # "mark:name" (first mark with a rect and that name)
        name = spec.split(":", 1)[1]
        for m in marks:
            if m["name"] == name and "rect" in m:
                return tuple(m["rect"])
        raise KeyError(f"mark {name} not found")
    return tuple(spec)


class Layout:
    """Where the screen crop goes and where the text goes, per output format."""

    def __init__(self, fmt: str):
        self.fmt = fmt
        self.W, self.H = FORMATS[fmt]
        if fmt == "9x16":
            self.card = (1008, 780)
            self.card_xy = (36, 600)
        else:
            self.card = (self.W, self.H)
            self.card_xy = (0, 0)
        self.aspect = self.card[0] / self.card[1]

    def background(self) -> Image.Image:
        if self.fmt == "9x16":
            return gradient(self.W, self.H, (38, 16, 98), (109, 46, 240), 0.35)
        return Image.new("RGB", (self.W, self.H), (255, 255, 255))


def compose_clip_frame(lay: Layout, base: Image.Image, frame: np.ndarray, rect, caption: Image.Image | None, cap_opacity: float,
                       head: Image.Image | None, top: bool = False) -> Image.Image:
    box = tuple(float(v) for v in rect)
    crop = Image.fromarray(frame).resize(lay.card, Image.BICUBIC, box=box)
    out = base.copy()
    if lay.fmt == "9x16":
        card = shadowed(rounded(crop, 34))
        pad = (card.width - lay.card[0]) // 2
        out.paste(card, (lay.card_xy[0] - pad, lay.card_xy[1] - pad), card)
        if head is not None:
            paste_alpha(out, head, ((lay.W - head.width) // 2, 150), cap_opacity)
        foot = text_block("Owl-L  ·  free & offline", 40, (225, 215, 255), 900, bold=False)
        paste_alpha(out, foot, ((lay.W - foot.width) // 2, lay.H - 190))
    else:
        out.paste(crop.convert("RGB"), (0, 0))
        if caption is not None:
            y = int(lay.H * 0.05) if top else lay.H - caption.height - int(lay.H * 0.06)
            paste_alpha(out, caption, ((lay.W - caption.width) // 2, y + int((1 - ease(cap_opacity)) * 18)), cap_opacity)
    return out


def card_frame(lay: Layout, t: float, dur: float, scene: dict) -> Image.Image:
    """Title cards (hook, outro): gradient, logo, lines of text, with a gentle entrance."""
    W, H = lay.W, lay.H
    img = gradient(W, H, (38, 16, 98), (109, 46, 240), 0.5 + 0.12 * math.sin(t * 0.8))
    base = min(W, H)
    a_in, a_out = ease(t / 0.55), ease((dur - t) / 0.35)
    a = min(a_in, a_out) if scene.get("fade_out", True) else a_in
    vertical = lay.fmt == "9x16"
    y = int(H * (0.2 if vertical else 0.16))
    if scene.get("logo", True):
        s = int(base * (0.26 if not vertical else 0.30)) + int(8 * ease(t / 1.2))
        paste_alpha(img, logo(s), ((W - s) // 2, y + int((1 - a_in) * 30)), a)
        y += s + int(base * 0.04)
    for line in scene["lines"]:
        size = int(base * line.get("size", 0.06) * (1.25 if vertical and line.get("size", 0.06) < 0.05 else 1.0))
        blk = text_block(line["text"], size, tuple(line.get("color", (255, 255, 255))), int(W * 0.84), bold=line.get("bold", True))
        paste_alpha(img, blk, ((W - blk.width) // 2, y + int((1 - a_in) * 22)), a * line.get("opacity", 1))
        y += blk.height + int(base * 0.03)
    return img


def wifi_off(size: int) -> Image.Image:
    """A small 'no network' badge (Wi-Fi arcs with a slash): an overlay, not a screenshot of the system."""
    s = size * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=s // 5, fill=(28, 27, 34, 235))
    cx, cy = s // 2, int(s * 0.70)
    for i, r in enumerate((0.40, 0.28, 0.16)):
        R = int(s * r)
        d.arc((cx - R, cy - R, cx + R, cy + R), 225, 315, fill=(255, 255, 255, 255), width=max(6, s // 16))
    d.ellipse((cx - s // 24, cy - s // 24, cx + s // 24, cy + s // 24), fill=(255, 255, 255, 255))
    d.line((int(s * 0.18), int(s * 0.18), int(s * 0.82), int(s * 0.82)), fill=(255, 92, 92, 255), width=max(8, s // 14))
    return im.resize((size, size), Image.LANCZOS)


def scene_frames(scene: dict, lay: Layout, short: bool, dur: float, ranges: list | None = None, extra: int = 0, period: float | None = None):
    """Yields composed PIL frames for one scene in one format: int(dur * FPS) frames plus `extra` more (the lead-out that is cross-faded
    into the next scene). `ranges` are the stretches of the clip to play (already fitted to dur); `period` is the length of a beat:
    camera moves start on a beat."""
    n = int(round(dur * FPS))
    total = n + extra
    if scene["type"] == "card":
        for i in range(total):
            yield card_frame(lay, i / FPS, dur, scene)
        return
    clip = CLIPS / f"{scene['clip']}.mp4"
    marks = load_marks(scene["clip"])["marks"]
    keys = []
    for k in scene.get("focus", [{"t": 0, "rect": [0, 0, REC_W, REC_H]}]):
        tall = lay.fmt == "9x16"
        rect = resolve_rect((k.get("rect9") if tall else None) or k.get("rect") or k["mark"], marks)
        pad = k.get("pad9", k.get("pad", 1.0) * 0.76) if tall else k.get("pad", 1.0)
        t = k["t"]
        if period and t > 0:
            t = max(period, round(t / period) * period)    # a camera move starts on a beat
        keys.append((t, fit_rect(rect, lay.aspect, pad)))
    cam = Camera(keys)
    base = lay.background()
    cap_text = scene.get("caption")
    cap_text2 = scene.get("caption2")
    full = (cap_text + (chr(10) + cap_text2 if cap_text2 else "")) if cap_text else None
    caption = pill(full, int(lay.H * (0.034 if lay.fmt != "9x16" else 0.03)), int(lay.W * 0.86)) if full and lay.fmt != "9x16" else None
    head = text_block(full, 74, (255, 255, 255), 900) if full and lay.fmt == "9x16" else None
    badge = wifi_off(int(lay.W * 0.08)) if scene.get("overlay") == "wifi_off" else None
    ranges = ranges or scene.get("ranges")

    def source():
        for a, b, sp in ranges:
            yield from read_frames(clip, a, b - a, sp)

    i = 0
    im = None
    for frame in source():
        t = i / FPS
        cap_a = min(ease((t - 0.25) / 0.35), ease((dur - t) / 0.3)) if i < n else 0.0
        im = compose_clip_frame(lay, base, frame, cam.at(t), caption, cap_a, head, scene.get("caption_pos") == "top")
        if badge is not None:
            paste_alpha(im, badge, (lay.W - badge.width - int(lay.W * 0.04), int(lay.H * 0.05)), ease((t - 0.3) / 0.4))
        yield im
        i += 1
        if i >= total:
            break
    while i < total and im is not None:  # the clip ended early: hold the last frame
        yield im
        i += 1


def crossfade(prev: Image.Image, nxt: Image.Image, a: float) -> Image.Image:
    return Image.blend(prev, nxt, a)


class Encoder:
    def __init__(self, path: Path, size: tuple[int, int]):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.p = subprocess.Popen([str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{size[0]}x{size[1]}",
                                   "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                                   "-an", str(path)], stdin=subprocess.PIPE)

    def write(self, im: Image.Image):
        self.p.stdin.write(im.convert("RGB").tobytes())

    def close(self):
        self.p.stdin.close()
        self.p.wait()


def render_video(timeline: dict, out: Path) -> Path:
    """Renders the video track (no sound) of a timeline from audio.build_timeline: every scene lasts a whole number of bars,
    and scene changes are cross-faded over the first frames of the next scene."""
    fmt = timeline["fmt"]
    short = fmt != "16x9"
    lay = Layout(fmt)
    period = timeline["grid"]["period"]
    enc = Encoder(out, (lay.W, lay.H))
    fade = int(0.25 * FPS)
    entries = timeline["entries"]
    carry: list[Image.Image] = []
    total = 0
    for idx, e in enumerate(entries):
        n = int(round(e["dur"] * FPS))
        last = idx == len(entries) - 1
        gen = scene_frames(e["scene"], lay, short, e["dur"], e.get("ranges"), 0 if last else fade, period)
        for k in range(n):
            im = next(gen)
            if carry and k < fade:
                im = crossfade(carry[k], im, (k + 1) / (fade + 1))
            enc.write(im)
            total += 1
        carry = list(gen) if not last else []
    enc.close()
    print(f"  {out.name}: {total / FPS:.1f}s ({len(entries)} scenes)")
    return out
