"""Developer helper (promo v2): downloads the CC0 candidates found by musicscan.py, measures tempo, energy and the strongest build-and-drop,
and writes a 20 s preview of each one's best part to work/music/candidates/."""
import json, subprocess, sys, urllib.parse, urllib.request, warnings
from pathlib import Path
import numpy as np
warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))
from config import FFMPEG, WORK
import audio

scan = json.loads((WORK / "music" / "pages" / "scan.json").read_text())
raw = WORK / "music" / "candidates" / "raw"
raw.mkdir(parents=True, exist_ok=True)
import librosa

rows = []
for href, r in scan.items():
    files = [f for f in r["files"] if f.lower().endswith((".mp3", ".ogg"))] or [f for f in r["files"] if f.lower().endswith(".wav")]
    if not files or "publicdomain/zero/1.0" not in r["licenses"]:
        continue
    # prefer the first mp3, else ogg, else wav
    files.sort(key=lambda f: (0 if f.endswith(".mp3") else 1 if f.endswith(".ogg") else 2))
    url = files[0]
    dest = raw / (href.strip("/").replace("/", "_") + Path(urllib.parse.unquote(url)).suffix)
    if not dest.exists():
        try:
            urllib.request.urlretrieve(url, dest)
        except Exception as e:
            print("skip", href, e)
            continue
    try:
        y = audio.decode(dest, mono=True, rate=22050)
    except Exception as e:
        print("decode failed", href, e)
        continue
    dur = len(y) / 22050
    y = y[: 22050 * 200]
    tempo, beats = librosa.beat.beat_track(y=y, sr=22050, start_bpm=120, units="time")
    bpm = float(np.atleast_1d(tempo)[0])
    while bpm < 100:
        bpm *= 2
    while bpm > 150:
        bpm /= 2
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    hop = 512 / 22050
    sm = np.convolve(rms, np.ones(int(1.0 / hop)) / int(1.0 / hop), mode="same")
    win = int(20 / hop)
    best, best_s = -1, 0
    for s0 in range(0, max(1, len(sm) - win), int(1.0 / hop)):
        seg = sm[s0: s0 + win]
        if len(seg) < win:
            break
        a, b = seg[: int(7 / hop)].mean(), seg[int(9 / hop):].mean()
        score = (b - a) / (seg.mean() + 1e-6) * 2 + seg.mean() * 6 + (1 if b > a * 1.25 else 0)
        if score > best:
            best, best_s = score, s0 * hop
    onset = librosa.onset.onset_strength(y=y, sr=22050)
    rows.append({"href": href, "title": r["title"], "author": r["author"], "url": url, "file": str(dest), "bpm": round(bpm, 1), "duration": round(dur, 1),
                 "rms_db": round(float(20 * np.log10(rms.mean() + 1e-9)), 1), "onset_per_s": round(float((onset > onset.mean() + onset.std()).sum() / (len(y) / 22050)), 2),
                 "best_start": round(best_s, 1), "build_ratio": round(float(sm[int((best_s + 9) / hop): int((best_s + 20) / hop)].mean() / (sm[int(best_s / hop): int((best_s + 7) / hop)].mean() + 1e-6)), 2)})
    print(rows[-1]["title"], rows[-1]["bpm"], rows[-1]["duration"], rows[-1]["rms_db"], rows[-1]["build_ratio"], flush=True)
json.dump(rows, open(WORK / "music" / "candidates" / "analysis.json", "w"), indent=1)
