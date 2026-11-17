"""Developer helper (promo v2, second music round): downloads Incompetech tracks (CC BY 4.0, machine-readable catalog) and three more
OpenGameArt CC0 tracks, measures tempo and energy, and writes a 20 s preview of each one's best build/drop to work/music/candidates2/."""
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))
import audio
from config import FFMPEG, WORK

OUT = WORK / "music" / "candidates2"
RAW = OUT / "raw"
RAW.mkdir(parents=True, exist_ok=True)
import librosa

pieces = {p["title"]: p for p in json.loads((WORK / "music" / "pieces.json").read_text(encoding="utf-8"))}
INC = ["Super Friendly", "Newer Wave", "New Friendly", "Delightful D", "Voltaic", "Raving Energy", "Special Spotlight", "Presenterator", "Voxel Revolution", "Laserpack", "Getting it Done", "Super Power Cool Dude"]
OGA = json.loads((WORK / "music" / "candidates" / "analysis.json").read_text(encoding="utf-8"))
OGA_PICK = {"Electro Opening Theme": "Zane? see page", "Party Sector": "", "Rhythm Garden": ""}

rows = []


def analyse(path: Path):
    y = audio.decode(path, mono=True, rate=22050)
    dur = len(y) / 22050
    y = y[: 22050 * 200]
    tempo, _ = librosa.beat.beat_track(y=y, sr=22050, start_bpm=120, units="time")
    bpm = float(np.atleast_1d(tempo)[0])
    while bpm < 100:
        bpm *= 2
    while bpm > 150:
        bpm /= 2
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    hop = 512 / 22050
    k = int(1.0 / hop)
    sm = np.convolve(rms, np.ones(k) / k, mode="same")
    win = int(20 / hop)
    best, best_s = -1e9, 0
    for s0 in range(0, max(1, len(sm) - win), k):
        seg = sm[s0: s0 + win]
        if len(seg) < win:
            break
        a, b = seg[: int(7 / hop)].mean(), seg[int(9 / hop):].mean()
        score = (b - a) / (seg.mean() + 1e-6) * 2 + seg.mean() * 6 + (1 if b > a * 1.25 else 0)
        if score > best:
            best, best_s = score, s0 * hop
    ratio = float(sm[int((best_s + 9) / hop): int((best_s + 20) / hop)].mean() / (sm[int(best_s / hop): int((best_s + 7) / hop)].mean() + 1e-6))
    return bpm, dur, best_s, ratio, float(20 * np.log10(rms.mean() + 1e-9))


def preview(path: Path, start: float, dst: Path):
    subprocess.run([str(FFMPEG), "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-t", "20", "-i", str(path), "-af", "afade=t=in:d=0.4,afade=t=out:st=18.8:d=1.2", "-b:a", "160k", str(dst)], check=True)


n = 0
for title in INC:
    p = pieces[title]
    url = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/" + urllib.parse.quote(p["filename"])
    f = RAW / p["filename"]
    if not f.exists():
        urllib.request.urlretrieve(url, f)
    bpm, dur, s, ratio, db = analyse(f)
    n += 1
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    preview(f, s, OUT / f"{n:02d}-{slug}.mp3")
    rows.append({"n": n, "title": title, "author": "Kevin MacLeod", "source": "https://incompetech.com/music/royalty-free/music.html (" + p["filename"] + ")", "license": "CC BY 4.0",
                 "credit": f'"{title}" Kevin MacLeod (incompetech.com)\nLicensed under Creative Commons: By Attribution 4.0\nhttps://creativecommons.org/licenses/by/4.0/',
                 "bpm_catalog": p["bpm"], "bpm": round(bpm, 1), "dur": round(dur), "start": round(s, 1), "build": round(ratio, 2), "rms_db": round(db, 1), "feel": p["feel"], "genre": p["genre"], "listed_bpm": p["bpm"]})
    print(rows[-1]["title"], rows[-1]["bpm"], p["bpm"], flush=True)
for r in OGA:
    if r["title"] in OGA_PICK:
        n += 1
        slug = re.sub(r"[^a-z0-9]+", "-", r["title"].lower()).strip("-")
        preview(Path(r["file"]), r["best_start"], OUT / f"{n:02d}-{slug}.mp3")
        rows.append({"n": n, "title": r["title"], "author": r["author"], "source": "https://opengameart.org" + r["href"], "license": "CC0", "credit": "none required (CC0)", "bpm": r["bpm"], "dur": round(r["duration"]), "start": r["best_start"], "build": r["build_ratio"], "rms_db": r["rms_db"], "feel": "", "genre": "OpenGameArt"})
json.dump(rows, open(OUT / "analysis.json", "w"), indent=1)
