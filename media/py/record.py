"""Screen recording with ffmpeg (gdigrab, 60 fps) and a small event log, so the renderer knows when and where to zoom."""
from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

import stage
from config import CLIPS, FFMPEG


class Recording:
    """with Recording("02-text") as rec: ... rec.mark("result", rect=(l,t,r,b)) ...
    Writes CLIPS/<name>.mp4 and CLIPS/<name>.json (marks in seconds since the first frame, rects in recorded-region pixels)."""

    def __init__(self, name: str, fps: int = 60, encoder: str = "h264_nvenc"):
        self.name = name
        self.fps = fps
        self.encoder = encoder
        self.marks: list[dict] = []
        self.t0 = 0.0
        self.proc: subprocess.Popen | None = None
        CLIPS.mkdir(parents=True, exist_ok=True)
        self.path = CLIPS / f"{name}.mp4"
        self.x, self.y, self.w, self.h = stage.region()

    def __enter__(self):
        enc = (["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "constqp", "-qp", "17"] if self.encoder == "h264_nvenc"
               else ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "16"])
        cmd = [str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-f", "gdigrab", "-framerate", str(self.fps), "-draw_mouse", "1",
               "-offset_x", str(self.x), "-offset_y", str(self.y), "-video_size", f"{self.w}x{self.h}", "-i", "desktop",
               *enc, "-pix_fmt", "yuv420p", str(self.path)]
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        time.sleep(1.0)  # ffmpeg needs a moment before the first frame
        self.t0 = time.perf_counter()
        return self

    def now(self) -> float:
        return time.perf_counter() - self.t0

    def mark(self, name: str, rect=None, **extra):
        """rect is in SCREEN pixels; it is stored relative to the recorded region."""
        entry = {"name": name, "t": round(self.now(), 3), **extra}
        if rect:
            l, t, r, b = rect
            entry["rect"] = [round(l - self.x), round(t - self.y), round(r - self.x), round(b - self.y)]
        self.marks.append(entry)

    def __exit__(self, *a):
        time.sleep(0.5)
        try:
            self.proc.stdin.write(b"q")
            self.proc.stdin.flush()
        except OSError:
            pass
        try:
            self.proc.wait(20)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        (CLIPS / f"{self.name}.json").write_text(json.dumps({"duration": round(self.now(), 3), "marks": self.marks}, indent=1), encoding="utf-8")
