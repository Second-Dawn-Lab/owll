"""Developer helper: a contact sheet of frames from a clip. usage: contact.py <clip> t1 t2 ... -> work/contact.png"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from config import CLIPS, FFMPEG, WORK

clip, times = sys.argv[1], [float(t) for t in sys.argv[2:]]
tiles = []
for i, t in enumerate(times):
    p = WORK / f"_c{i}.png"
    subprocess.run([str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-ss", str(t), "-i", str(CLIPS / f"{clip}.mp4"), "-frames:v", "1", "-vf", "scale=960:-1", str(p)], check=True)
    tiles.append(Image.open(p))
w, h = tiles[0].size
cols = 2
rows = (len(tiles) + 1) // 2
sheet = Image.new("RGB", (w * cols, h * rows), "white")
for i, im in enumerate(tiles):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(WORK / "contact.png")
