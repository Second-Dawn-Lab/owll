"""Promo v2: timeline (scenes on whole bars of Special Spotlight, voice-over, cues, sound effects), Remotion render, sound mix, subtitles, credits,
thumbnail and style frames.   usage: promo2.py timeline|render|mix|thumb|frames|all [--formats 16x9,9x16,1x1]"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import audio
from config import CLIPS, FFMPEG, MEDIA, OUT, WORK

SB = json.loads((MEDIA / "storyboard-v2.json").read_text(encoding="utf-8"))
NR = json.loads((MEDIA / "narration-v2.json").read_text(encoding="utf-8"))
V2 = WORK / "v2"
PUB = V2 / "public"
OUT2 = OUT / "v2"
REMOTION = MEDIA / "remotion"
FPS = 30
SFX_DIR = WORK / "sfx" / "raw"
# sound effects (all CC0, see work/sfx/README.md): name -> (file, gain, max seconds)
SFX = {
    "whoosh": ("whoosh__whoosh2_0.wav", 0.55, 1.1),
    "swish": ("swishes__swishes/swishes/swish-7.wav", 0.6, 0.6),
    "pop": ("pops__pop1.ogg", 0.7, 0.6),
    "click": ("kenney-ui51__UI_SFX_Set/click3.wav", 0.8, 0.6),
    "tick": ("kenney-ui51__UI_SFX_Set/switch12.wav", 0.6, 0.6),
    "sparkle": ("magic__magical_1_0.ogg", 0.4, 1.6),
    "chime": ("joth__UISoundEffects/Level Up.mp3", 0.38, 2.0),
}


def clip_duration(clip: str) -> float:
    p = CLIPS / f"{clip}.json"
    return json.loads(p.read_text(encoding="utf-8"))["duration"] if p.exists() else 1e9


def build(fmt: str) -> dict:
    short = fmt != "16x9"
    grid = audio.analyze_music()
    period, bar = grid["period"], grid["bar"]
    voice, speed, lang = NR["voice"], NR["speed"], NR["lang"]
    entries = []
    for sc in SB["scenes"]:
        if short and not sc["short"]:
            continue
        n = NR["scenes"][sc["id"]]
        use_short = short and "short" in n
        text = n["short"] if use_short else n["text"]
        caption = text if use_short else n.get("caption", text)
        s, sr = audio.speak(text, voice, speed, lang)
        narr_dur = len(s) / sr
        rr = (sc.get("ranges_short") if short and sc.get("ranges_short") else sc.get("ranges"))
        content = sum((b - a) / (sp * (2.2 if sp >= 3 else 1.0)) for a, b, sp in rr) if rr else 0.0
        min_bars = sc.get("min_bars_short", sc["min_bars"] if not short else {"where": 2, "capture": 2, "compare": 2}.get(sc["id"], sc["min_bars"]))
        bars = max(min_bars, math.ceil((audio.SPEECH_DELAY + narr_dur + audio.SPEECH_TAIL) / bar - 1e-6), math.ceil(content / bar - 1e-6))
        entries.append({"sc": sc, "bars": bars, "narr": {"text": caption, "dur": narr_dur, "samples": audio.resample(s, sr, audio.SR)}})
    total_bars = sum(e["bars"] for e in entries)
    if not short:
        entries[-1]["bars"] += (-total_bars) % 4          # the video is a whole number of 4-bar phrases and the outro ends with the music
    t = 0.0
    scenes, sfx_events = [], []
    for i, e in enumerate(entries):
        sc = e["sc"]
        e["start"], e["dur"] = t, e["bars"] * bar
        cues = {k: v * period for k, v in sc.get("cues_beats", {}).items()}
        item = {"id": sc["id"], "start": round(t, 4), "dur": round(e["dur"], 4), "cues": cues, "headline": sc["headline"], "accent": sc.get("accent"),
                "narr": {"text": e["narr"]["text"], "start": audio.SPEECH_DELAY, "dur": round(e["narr"]["dur"], 3)}}
        if sc.get("clip"):
            rr = sc.get("ranges_short") if short and sc.get("ranges_short") else sc["ranges"]
            item["clip"] = sc["clip"]
            item["ranges"] = audio.fit_ranges(rr, e["dur"], clip_duration(sc["clip"]))
            item["rects"] = [{"t": k.get("beat", 0) * period, "rect": k["rect"]} for k in sc["rects"]]
        scenes.append(item)
        if i > 0:
            sfx_events.append({"t": t - 0.22, "name": "whoosh" if i % 2 else "swish"})
        for ev in sc.get("sfx", []):
            at = cues[ev["cue"]] if "cue" in ev else ev["beat"] * period
            sfx_events.append({"t": t + at, "name": ev["name"]})
        t += e["dur"]
    return {"entries": entries, "tl": {"fmt": fmt, "fps": FPS, "period": period, "total": round(t, 4), "short": short, "scenes": scenes}, "sfx": sfx_events, "grid": grid}


def write_timeline(fmt: str) -> tuple[dict, Path]:
    b = build(fmt)
    d = V2 / "timelines"
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{fmt}.json"
    p.write_text(json.dumps({"tl": b["tl"]}, indent=1), encoding="utf-8")
    print(f"  {fmt}: {b['tl']['total']:.1f} s, " + ", ".join(f"{s['id']} {s['dur']:.1f}" for s in b["tl"]["scenes"]))
    return b, p


def stage_clips() -> None:
    d = PUB / "clips"
    d.mkdir(parents=True, exist_ok=True)
    for sc in SB["scenes"]:
        if sc.get("clip") and not (d / f"{sc['clip']}.mp4").exists():
            shutil.copy(CLIPS / f"{sc['clip']}.mp4", d / f"{sc['clip']}.mp4")


def remotion(args: list[str]) -> None:
    subprocess.run(["npx", "remotion", *args, "--gl=angle", f"--public-dir={PUB.as_posix()}"], cwd=REMOTION, shell=True, check=True)


def render_video(fmt: str, props: Path) -> Path:
    stage_clips()
    out = V2 / f"video-{fmt}.mp4"
    t0 = time.time()
    remotion(["render", "src/index.ts", "Promo", str(out), f"--props={props}", "--concurrency=3"])
    print(f"  rendered {fmt} in {time.time() - t0:.0f} s")
    return out


# --- sound ---------------------------------------------------------------------------------------------------------------------------
def sfx_track(events: list[dict], total: float) -> np.ndarray:
    n = int((total + 1.0) * audio.SR)
    out = np.zeros((n, 2), np.float32)
    cache: dict[str, np.ndarray] = {}
    for ev in events:
        name = ev["name"]
        if name not in cache:
            f, gain, maxs = SFX[name]
            a = audio.decode(SFX_DIR / f)
            pk = float(np.abs(a).max()) or 1.0
            a = a[: int(maxs * audio.SR)] / pk * 0.8 * gain
            fade = int(0.08 * audio.SR)
            a[-fade:] *= np.linspace(1, 0, min(fade, len(a)))[:, None]
            cache[name] = a
        a = cache[name]
        i = max(0, int(ev["t"] * audio.SR))
        out[i: i + len(a)] += a[: max(0, n - i)]
    return out


def mix(b: dict, video: Path, out: Path, with_music: bool, with_sfx: bool = True) -> dict:
    tl = {"fmt": b["tl"]["fmt"], "grid": b["grid"], "total": b["tl"]["total"], "entries": [{"start": e["start"], "narr": {"samples": e["narr"]["samples"], "duration": e["narr"]["dur"]}} for e in b["entries"]]}
    tag = f"v2-{tl['fmt']}{'' if with_music else '-nomusic'}"
    voice = audio.voice_track(tl)
    vwav = WORK / f"voice-{tag}.wav"
    audio.write_wav(vwav, np.stack([voice, voice], axis=1) * 0.9)
    swav = WORK / f"sfx-{tag}.wav"
    audio.write_wav(swav, sfx_track(b["sfx"], tl["total"]) if with_sfx else np.zeros((int((tl["total"] + 1) * audio.SR), 2), np.float32))
    inputs = ["-i", str(vwav), "-i", str(swav)]
    if with_music:
        mwav = WORK / f"music-{tag}.wav"
        audio.write_wav(mwav, audio.music_track(tl) * 0.3)
        inputs = ["-i", str(mwav)] + inputs
        fc = ("[1:a]asplit=2[vkey][vmix];[0:a][vkey]sidechaincompress=threshold=0.012:ratio=9:attack=12:release=450:makeup=1[duck];"
              "[duck][vmix][2:a]amix=inputs=3:normalize=0:duration=longest[mx];[mx]loudnorm=I=-14:TP=-2.0:LRA=9[a]")
    else:
        fc = "[0:a][1:a]amix=inputs=2:normalize=0:duration=longest[mx];[mx]loudnorm=I=-14:TP=-2.0:LRA=9[a]"
    cmd = [str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-i", str(video), *inputs, "-filter_complex", _shift(fc), "-map", "0:v", "-map", "[a]",
           "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)
    return audio.loudness(out)


def _shift(fc: str) -> str:
    """The video is input 0, so the audio inputs are 1, 2, 3: renumber the labels written for 0, 1, 2."""
    import re

    return re.sub(r"\[(\d):a\]", lambda m: f"[{int(m.group(1)) + 1}:a]", fc)


def write_srt(b: dict, path: Path) -> None:
    lines = []
    for n, s in enumerate(b["tl"]["scenes"], 1):
        a = s["start"] + s["narr"]["start"]
        lines += [str(n), f"{audio.srt_time(a)} --> {audio.srt_time(a + s['narr']['dur'] + 0.15)}", s["narr"]["text"], ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def credits(path: Path, grid: dict) -> None:
    m, t, v = audio.SOURCES["music"], audio.SOURCES["tts_model"], audio.SOURCES["tts_voices"]
    path.write_text(f"""Owl-L promo v2: credits and licences

MUSIC
  {m['credit']}
  Source: {m['page']}   Tempo {grid['bpm']} BPM.
  Licence: {m['license']} ({m['license_url']}). The credit line above must stay in the video description and in every post.

OWL ARTWORK
  Owl artwork: Second Dawn

SOUND EFFECTS (all CC0 / public domain, from OpenGameArt)
  Air whoosh by pyranostudios (https://opengameart.org/content/air-whoosh)
  Swishes Sound Pack by artisticdude (https://opengameart.org/content/swishes-sound-pack)
  Pop sounds by cogitollc (https://opengameart.org/content/pop-sounds)
  51 UI sound effects by Kenney (https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks)
  Magic Spell SFX by JaggedStone (https://opengameart.org/content/magic-spell-sfx)
  7 Assorted Sound Effects (Menu, Level Up) by Joth (https://opengameart.org/content/7-assorted-sound-effects-menu-level-up)

VOICE-OVER (generated locally; no audio was recorded from a person)
  Model:   {t['title']} by {t['author']}, {t['license']} ({t['page']})
  Voice:   af_heart (American English, female), from the Kokoro voice pack ({v['page']}); {v['license']}.
  The Kokoro model card lists two CC BY datasets in its training data (SIWIS, CC BY 4.0, and Koniwa tnc, CC BY 3.0); the weights are Apache-2.0
  and need no attribution. Credit for completeness: SIWIS database (University of Edinburgh) and Koniwa.

FONT
  Plus Jakarta Sans (SIL Open Font License 1.1), bundled through @fontsource/plus-jakarta-sans.

TOOLS
  Remotion 4.0.544 (free licence: individuals and small companies), React, ffmpeg (ffmpeg-static 5.2.0), librosa (ISC), kokoro-onnx (MIT),
  Pillow, NumPy, SciPy.

Everything shown on screen is made-up content.
""", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("steps", nargs="*", default=["all"])
    ap.add_argument("--formats", default="16x9,9x16,1x1")
    ap.add_argument("--frames-only", default="")
    a = ap.parse_args()
    steps = set(a.steps)
    if "all" in steps:
        steps |= {"timeline", "render", "mix", "thumb"}
    OUT2.mkdir(parents=True, exist_ok=True)
    for fmt in a.formats.split(","):
        b, props = write_timeline(fmt)
        if "render" in steps:
            video = render_video(fmt, props)
        else:
            video = V2 / f"video-{fmt}.mp4"
        if "mix" in steps:
            out = OUT2 / f"owll-promo-{fmt}.mp4"
            loud = mix(b, video, out, with_music=True)
            write_srt(b, OUT2 / f"owll-promo-{fmt}.srt")
            print(f"  {out.name}: {b['tl']['total']:.1f} s, {loud}")
            if fmt == "9x16":
                mix(b, video, OUT2 / "owll-promo-9x16-nomusic.mp4", with_music=False)
        if "frames" in steps and fmt == "16x9":
            for s in b["tl"]["scenes"]:
                f = int((s["start"] + min(s["dur"] * 0.7, 4.5 * b["tl"]["period"] * 1.0 + 1.0)) * FPS)
                remotion(["still", "src/index.ts", "Promo", str(OUT2 / "style-frames" / f"scene-{s['id']}.png"), f"--props={props}", f"--frame={f}"])
        credits(OUT2 / "CREDITS.txt", b["grid"])
    if "thumb" in steps:
        stage_clips()
        remotion(["still", "src/index.ts", "Thumb", str(OUT2 / "owll-thumbnail.png"), "--frame=5"])


if __name__ == "__main__":
    main()
