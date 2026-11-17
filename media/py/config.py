"""Paths and constants shared by the scripts. Everything generated lives OUTSIDE the repositories."""
import os
from pathlib import Path

MEDIA = Path(__file__).resolve().parent.parent           # owll/media
OWLL = MEDIA.parent                                      # owll/
BASE = Path(os.environ.get("OWLL_MEDIA_DIR", r"E:\SecondDawn\media"))
WORK = BASE / "work"                                     # raw clips, generated assets, fake profile
OUT = BASE / "out"                                       # final files
CLIPS = WORK / "clips"
ASSETS = WORK / "assets"
FFMPEG = MEDIA / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"
BRAND = OWLL / "assets" / "brand"
APP_EXE = Path(os.environ.get("OWLL_DEMO_EXE", str(OWLL / "src-tauri" / "target-demo" / "release" / "owll.exe")))

# The screen is recorded as a 16:9 region of the primary monitor (100% scaling assumed, checked at record time).
REC_W, REC_H = 2400, 1350
PURPLE = (109, 46, 240)
PURPLE_DARK = (62, 24, 150)
INK = (28, 27, 34)
FONT = r"C:\Windows\Fonts\segoeui.ttf"
FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_SEMI = r"C:\Windows\Fonts\seguisb.ttf"
