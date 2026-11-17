"""Developer helper: a contact sheet of a rendered video. usage: sheet.py <file> <step_seconds> [cols] -> work/sheet.png"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from config import FFMPEG, WORK

f, step = sys.argv[1], float(sys.argv[2])
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
out = WORK / "sheet_frames"
out.mkdir(exist_ok=True)
for old in out.glob("*.png"):
    old.unlink()
subprocess.run([str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-i", f, "-vf", f"fps=1/{step},scale=640:-1", str(out / "f%03d.png")], check=True)
tiles = [Image.open(p) for p in sorted(out.glob("*.png"))]
w, h = tiles[0].size
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGB", (w * cols, h * rows), "white")
for i, im in enumerate(tiles):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(WORK / "sheet.png")
print(len(tiles), "frames", sheet.size)
