"""Sound for the promo videos: the music (a CC0 track, downloaded and checked), its beat grid (librosa), the voice-over (Kokoro, local),
the timeline that snaps every scene to whole bars of the music, the mix (the music ducks under the voice, about -14 LUFS), and the
subtitle files. Nothing here leaves the machine except the one-time downloads listed in sources.json."""
from __future__ import annotations

import hashlib
import json
import math
import subprocess
import urllib.request
import warnings
from pathlib import Path

import numpy as np

from config import FFMPEG, MEDIA, OUT, WORK

warnings.filterwarnings("ignore")
SR = 44100
SOURCES = json.loads((MEDIA / "sources.json").read_text(encoding="utf-8"))
NARRATION = MEDIA / "narration.json"
SPEECH_DELAY = 0.30     # the voice starts this long after the downbeat of its scene
SPEECH_TAIL = 0.45      # pause after the sentence before the scene may end


# --- downloads --------------------------------------------------------------------------------------------------------------------
def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure(key: str) -> Path:
    """The file for a sources.json entry: downloaded when missing, always checked against its SHA-256."""
    src = SOURCES[key]
    path = WORK / src["file"]
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"  downloading {src['title']} ...")
        urllib.request.urlretrieve(src["url"], path)
    if sha256(path) != src["sha256"]:
        raise SystemExit(f"{path} does not match the checksum in sources.json (changed upstream?). Delete it to download again, or update the checksum after checking the license.")
    return path


# --- beat grid --------------------------------------------------------------------------------------------------------------------
def decode(path: Path, mono: bool = False, rate: int = SR) -> np.ndarray:
    out = subprocess.run([str(FFMPEG), "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1" if mono else "2", "-ar", str(rate), "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(out, np.float32)
    return a if mono else a.reshape(-1, 2)


def analyze_music() -> dict:
    """Tempo, a constant beat grid and the first downbeat of the track (cached in work/music/analysis.json)."""
    cache = WORK / "music" / "analysis.json"
    mp3 = ensure("music")
    key = sha256(mp3)
    if cache.exists():
        c = json.loads(cache.read_text(encoding="utf-8"))
        if c.get("sha256") == key:
            return c
    import librosa

    y = decode(mp3, mono=True, rate=22050)
    sr = 22050
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time", start_bpm=128, tightness=200)
    beats = np.asarray(beats, float)
    k = np.arange(len(beats))
    slope, intercept = np.polyfit(k, beats, 1)            # a constant grid: t = intercept + k * period
    period = float(slope)
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
    times = librosa.frames_to_time(np.arange(len(onset)), sr=sr, hop_length=512)
    strengths = []
    for off in range(4):                                  # which beat of the bar is the downbeat: where the onsets are strongest
        ts = intercept + (np.arange(off, len(beats), 4)) * period
        strengths.append(float(np.interp(ts, times, onset).sum()))
    down_offset = int(np.argmax(strengths))
    first_down = float(intercept + down_offset * period)
    # a clean first bar: the first downbeat at or after 0
    while first_down - 4 * period >= 0:
        first_down -= 4 * period
    result = {"sha256": key, "bpm": round(60 / period, 2), "librosa_tempo": round(float(np.atleast_1d(tempo)[0]), 2), "period": period,
              "bar": 4 * period, "first_downbeat": first_down, "downbeat_offset_strengths": [round(s, 2) for s in strengths],
              "duration": len(y) / sr}
    cache.write_text(json.dumps(result, indent=1), encoding="utf-8")
    return result


# --- narration --------------------------------------------------------------------------------------------------------------------
def narration_script() -> dict:
    return json.loads(NARRATION.read_text(encoding="utf-8"))


def speak(text: str, voice: str, speed: float, lang: str) -> tuple[np.ndarray, int]:
    """One sentence with Kokoro (cached by text, voice and speed)."""
    cache = WORK / "tts-cache"
    cache.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(f"{voice}|{speed}|{lang}|{text}".encode()).hexdigest()[:16]
    wav = cache / f"{key}.npy"
    if wav.exists():
        return np.load(wav), 24000
    from kokoro_onnx import Kokoro

    global _kokoro
    if "_kokoro" not in globals() or _kokoro is None:
        _kokoro = Kokoro(str(ensure("tts_model")), str(ensure("tts_voices")))
    s, sr = _kokoro.create(text, voice=voice, speed=speed, lang=lang)
    s = np.asarray(s, np.float32)
    # trim silence at both ends (keep a few ms) so the timing is the speech itself
    idx = np.where(np.abs(s) > 0.004)[0]
    if len(idx):
        s = s[max(0, idx[0] - int(0.02 * sr)): idx[-1] + int(0.05 * sr)]
    np.save(wav, s)
    return s, sr


def resample(a: np.ndarray, sr_from: int, sr_to: int) -> np.ndarray:
    if sr_from == sr_to:
        return a
    n = int(len(a) * sr_to / sr_from)
    return np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)


# --- timeline: scenes on whole bars --------------------------------------------------------------------------------------------------
def fit_ranges(ranges: list, total: float, clip_duration: float) -> list:
    """Makes the stretches of a clip add up to `total` seconds: waiting (stretches played at 3x or more) is sped up or slowed down, the
    last stretch is extended into the clip, and what is still missing is a held last frame. Real-time stretches are never changed."""
    rr = [list(r) for r in ranges]
    dur = lambda r: (r[1] - r[0]) / r[2]
    fast = [r for r in rr if r[2] >= 3.0]
    slow = [r for r in rr if r[2] < 3.0]
    fast_t, slow_t = sum(dur(r) for r in fast), sum(dur(r) for r in slow)
    if fast and slow_t < total and (fast_t + slow_t) > total:
        f = fast_t / max(0.2, total - slow_t)             # speed the waiting up
        for r in fast:
            r[2] *= f
    elif fast and slow_t < total:                         # there is time to spare: let the waiting play a bit slower (not slower than 2x)
        f = max(0.5, (total - slow_t) / fast_t)
        for r in fast:
            r[2] = max(2.0, r[2] / min(f, 3.0))
    now = sum(dur(r) for r in rr)
    if now < total - 1e-3:                                # extend the last stretch into the clip
        last = rr[-1]
        room = max(0.0, clip_duration - 0.1 - last[1])
        add = min(room, (total - now) * last[2])
        last[1] += add
    return rr


def content_min(scene: dict, short: bool) -> float:
    rr = scene.get("ranges_short") if short and scene.get("ranges_short") else scene.get("ranges")
    if not rr:
        return 0.0
    return sum((b - a) / (sp * (2.2 if sp >= 3.0 else 1.0)) for a, b, sp in rr)


def build_timeline(storyboard: dict, fmt: str) -> dict:
    """Scenes with start, length (whole bars) and voice-over, for one format. Also the music grid."""
    from render import load_marks

    short = fmt != "16x9"
    grid = analyze_music()
    bar = grid["bar"]
    script = narration_script()
    voice, speed, lang = script["voice"], script["speed"], script["lang"]
    entries = []
    for sc in storyboard["scenes"]:
        if short and sc.get("dur_short") is False:
            continue
        text = script["scenes"].get(sc["id"], {}).get("text_short" if short else "text")
        narr = None
        if text:
            s, sr = speak(text, voice, speed, lang)
            narr = {"text": text, "samples": resample(s, sr, SR), "duration": len(s) / sr}
        need = max((SPEECH_DELAY + narr["duration"] + SPEECH_TAIL) if narr else 0.0, content_min(sc, short), sc.get("min_seconds_short" if short else "min_seconds", 0.0))
        bars = max(1, math.ceil(need / bar - 1e-6), sc.get("min_bars_short" if short else "min_bars", 1))
        entries.append({"scene": sc, "bars": bars, "narr": narr})
    # the whole video is a whole number of 4-bar phrases: the last scene gets the missing bars
    total = sum(e["bars"] for e in entries)
    entries[-1]["bars"] += (-total) % 4
    t = 0.0
    for e in entries:
        e["start"], e["dur"] = t, e["bars"] * bar
        t += e["dur"]
        sc = e["scene"]
        if sc["type"] == "clip":
            rr = sc.get("ranges_short") if short and sc.get("ranges_short") else sc["ranges"]
            e["ranges"] = fit_ranges(rr, e["dur"], load_marks(sc["clip"]).get("duration", 1e9))
    return {"fmt": fmt, "grid": grid, "entries": entries, "total": t}


# --- mix --------------------------------------------------------------------------------------------------------------------------
def voice_track(tl: dict) -> np.ndarray:
    n = int((tl["total"] + 1.0) * SR)
    v = np.zeros(n, np.float32)
    for e in tl["entries"]:
        if e["narr"] is not None:
            a = int((e["start"] + SPEECH_DELAY) * SR)
            s = e["narr"]["samples"]
            v[a: a + len(s)] += s[: max(0, n - a)]
    return v


def music_track(tl: dict) -> np.ndarray:
    """The track from its first downbeat, looped with a one-bar crossfade if the video is longer, faded in over a bar and out over the last bar."""
    g = tl["grid"]
    a = decode(ensure("music"))
    a = a[int(g["first_downbeat"] * SR):]
    need = int(tl["total"] * SR)
    bar = int(g["bar"] * SR)
    # whole bars only, so a loop point falls on a downbeat
    a = a[: (len(a) // bar) * bar]
    out = a
    while len(out) < need:
        xf = bar
        tail, head = out[-xf:], a[:xf]
        w = np.linspace(0, 1, xf, dtype=np.float32)[:, None]
        out = np.concatenate([out[:-xf], tail * (1 - w) + head * w, a[xf:]])
    out = out[:need].copy()
    fin = np.linspace(0, 1, bar, dtype=np.float32) ** 1.5
    out[:bar] *= fin[:, None]
    fout = np.linspace(1, 0, bar, dtype=np.float32) ** 1.5
    out[-bar:] *= fout[:, None]
    return out


def write_wav(path: Path, a: np.ndarray) -> None:
    import soundfile as sf

    sf.write(str(path), a, SR, subtype="PCM_24")


def mix(tl: dict, video: Path, out: Path, with_music: bool) -> dict:
    """Muxes narration (+ ducked music) into the video; returns loudness numbers."""
    tag = f"{tl['fmt']}{'' if with_music else '-nomusic'}"
    voice = voice_track(tl)
    vwav = WORK / f"voice-{tag}.wav"
    write_wav(vwav, np.stack([voice, voice], axis=1) * 0.9)
    if with_music:
        mwav = WORK / f"music-{tl['fmt']}.wav"
        m = music_track(tl)
        write_wav(mwav, m * 0.3)                          # the baseline level of the music before ducking
        fc = ("[2:a]asplit=2[vkey][vmix];"
              "[1:a][vkey]sidechaincompress=threshold=0.012:ratio=9:attack=12:release=450:makeup=1[duck];"
              "[duck][vmix]amix=inputs=2:normalize=0:duration=longest[mx];"
              "[mx]loudnorm=I=-14:TP=-1.5:LRA=9[a]")
        inputs = ["-i", str(mwav), "-i", str(vwav)]
    else:
        fc = "[1:a]loudnorm=I=-14:TP=-1.5:LRA=9[a]"
        inputs = ["-i", str(vwav)]
    cmd = [str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-i", str(video), *inputs, "-filter_complex", fc,
           "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)
    return loudness(out)


def loudness(path: Path) -> dict:
    r = subprocess.run([str(FFMPEG), "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr
    i = txt.rfind("Integrated loudness")
    seg = txt[i:]
    import re

    lufs = re.search(r"I:\s+(-?[\d.]+) LUFS", seg)
    tp = re.search(r"Peak:\s+(-?[\d.]+) dBFS", seg)
    return {"lufs": float(lufs.group(1)) if lufs else None, "true_peak_db": float(tp.group(1)) if tp else None}


# --- subtitles and credits ------------------------------------------------------------------------------------------------------------
def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def write_srt(tl: dict, path: Path) -> None:
    lines = []
    n = 0
    for e in tl["entries"]:
        if e["narr"] is None:
            continue
        n += 1
        a = e["start"] + SPEECH_DELAY
        lines += [str(n), f"{srt_time(a)} --> {srt_time(a + e['narr']['duration'] + 0.15)}", e["narr"]["text"], ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def write_credits(path: Path, grid: dict, loud: dict) -> None:
    m, t, v = SOURCES["music"], SOURCES["tts_model"], SOURCES["tts_voices"]
    path.write_text(f"""Owl-L promo videos: music and voice credits

MUSIC
  "{m['title']}" by {m['author']}
  Source:  {m['page']}
  License: {m['license']} ({m['license_url']})
  No attribution is required; it is given here anyway. Tempo {grid['bpm']} BPM.

VOICE-OVER (generated locally; no audio was recorded from a person)
  Model:   {t['title']}
  Author:  {t['author']}
  Source:  {t['page']}
  License: {t['license']}
  Voice:   af_heart (American English, female), part of the Kokoro voice pack
           ({v['page']}); {v['license']}.
  The Kokoro model card lists two CC BY datasets in its training data (SIWIS, CC BY 4.0, and Koniwa tnc, CC BY 3.0); the model weights
  themselves are Apache-2.0 and need no attribution. Credit for completeness: SIWIS database (University of Edinburgh) and Koniwa.

TOOLS
  ffmpeg (ffmpeg-static 5.2.0, GPL build by Gyan), librosa (ISC), kokoro-onnx (MIT), onnxruntime (MIT), Pillow (HPND), NumPy (BSD).

Everything shown on screen is made-up content.
""", encoding="utf-8")
