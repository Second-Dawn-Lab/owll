"""Developer helper (promo v2): the CC0 sound effects chosen from OpenGameArt, a table, and one preview file that plays them in order."""
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent))
import audio
from config import FFMPEG, WORK

R = WORK / "sfx" / "raw"
OGA = "https://opengameart.org/content/"
PICKS = [
    ("whoosh", "whoosh__whoosh2_0.wav", "Air whoosh", "pyranostudios", OGA + "air-whoosh"),
    ("swish 1", "swishes__swishes/swishes/swish-1.wav", "Swishes Sound Pack", "artisticdude", OGA + "swishes-sound-pack"),
    ("swish 2", "swishes__swishes/swishes/swish-7.wav", "Swishes Sound Pack", "artisticdude", OGA + "swishes-sound-pack"),
    ("pop", "pops__pop1.ogg", "Pop sounds", "cogitollc", OGA + "pop-sounds"),
    ("bubble pop", "bubble__pop.ogg", "bubbles 'pop'", "farfadet46", OGA + "bubbles-pop"),
    ("soft click", "kenney-ui51__UI_SFX_Set/click3.wav", "51 UI sound effects", "Kenney", OGA + "51-ui-sound-effects-buttons-switches-and-clicks"),
    ("switch click", "kenney-ui51__UI_SFX_Set/switch12.wav", "51 UI sound effects", "Kenney", OGA + "51-ui-sound-effects-buttons-switches-and-clicks"),
    ("sparkle", "magic__magical_1_0.ogg", "Magic Spell SFX", "JaggedStone", OGA + "magic-spell-sfx"),
    ("level-up chime", "joth__UISoundEffects/Level Up.mp3", "7 Assorted Sound Effects (Menu, Level Up)", "Joth", OGA + "7-assorted-sound-effects-menu-level-up"),
    ("transition", "joth__UISoundEffects/Transition.mp3", "7 Assorted Sound Effects (Menu, Level Up)", "Joth", OGA + "7-assorted-sound-effects-menu-level-up"),
]

parts = []
lines = ["| # | Use | File | Pack | Author | Length | Source | License |", "|---|---|---|---|---|---|---|---|"]
for i, (use, f, pack, author, url) in enumerate(PICKS, 1):
    p = R / f
    a = audio.decode(p, mono=True, rate=44100)
    pk = float(np.abs(a).max())
    a = (a / pk * 0.8 if pk > 0 else a)[: int(2.5 * 44100)]
    parts += [a, np.zeros(int(0.6 * 44100), np.float32)]
    lines.append(f"| {i} | {use} | {p.name} | {pack} | {author} | {len(a) / 44100:.2f} s | {url} | CC0 |")
sf.write(str(WORK / "sfx" / "sfx-preview.wav"), np.concatenate(parts), 44100)
subprocess.run([str(FFMPEG), "-y", "-loglevel", "error", "-i", str(WORK / "sfx" / "sfx-preview.wav"), "-b:a", "160k", str(WORK / "sfx" / "sfx-preview.mp3")], check=True)
(WORK / "sfx" / "README.md").write_text("\n".join(lines) + "\n\nsfx-preview.mp3 plays them in this order, 0.6 s apart (normalised for the preview only). All pages state CC0.\n", encoding="utf-8")
print("\n".join(lines))
