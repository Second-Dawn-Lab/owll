"""Developer helper: redo only the sound of a format (no frame rendering). usage: remux.py 9x16"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import audio
import config

fmt = sys.argv[1]
sb = json.loads((config.MEDIA / "storyboard.json").read_text(encoding="utf-8"))
tl = audio.build_timeline(sb, fmt)
silent = config.WORK / f"video-{fmt}.mp4"
out = config.OUT / f"owll-promo-{fmt}.mp4"
print(audio.mix(tl, silent, out, with_music=True))
audio.write_srt(tl, config.OUT / f"owll-promo-{fmt}.srt")
