"""One entry point:  make_demo.py [assets] [record [scene ...]] [render [format ...]] [gif] [thumb] [all]
See media/README.md. Run it through make-demo.ps1 (which uses the pinned virtual environment)."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import config  # noqa: E402


def storyboard() -> dict:
    return json.loads((config.MEDIA / "storyboard.json").read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser(description="Owl-L demo: record the scenes, render the videos, the GIF and the thumbnail.")
    ap.add_argument("steps", nargs="*", default=["all"], help="assets | record | render | gif | thumb | all")
    ap.add_argument("--scenes", default="", help="record only these scenes, e.g. 03-popup,05-live (default: all)")
    ap.add_argument("--formats", default="16x9,9x16,1x1", help="render only these formats")
    ap.add_argument("--list", action="store_true", help="list the scenes and exit")
    a = ap.parse_args()
    steps = set(a.steps)
    if "all" in steps:
        steps |= {"assets", "record", "render", "gif", "thumb"}

    import scenes

    if a.list:
        for name in scenes.SCENES:
            print(name)
        return
    t0 = time.time()
    if "assets" in steps:
        import make_assets

        make_assets.ASSETS.mkdir(parents=True, exist_ok=True)
        make_assets.make_article()
        make_assets.make_sign()
        make_assets.make_video()
        make_assets.make_docx()
        print("assets ready")
    if "record" in steps:
        wanted = [s for s in a.scenes.split(",") if s] or list(scenes.SCENES)
        scenes.record(wanted)
    sb = storyboard()
    if "render" in steps:
        import audio
        import render

        for fmt in a.formats.split(","):
            tl = audio.build_timeline(sb, fmt)
            for e in tl["entries"]:
                print(f"    {e['scene']['id']:8s} {e['bars']} bars  {e['dur']:5.2f}s" + (f"  voice {e['narr']['duration']:.1f}s" if e["narr"] else ""))
            silent = config.WORK / f"video-{fmt}.mp4"
            render.render_video(tl, silent)
            out = config.OUT / f"owll-promo-{fmt}.mp4"
            loud = audio.mix(tl, silent, out, with_music=True)
            audio.write_srt(tl, config.OUT / f"owll-promo-{fmt}.srt")
            print(f"  {out.name}: {tl['total']:.1f}s, {loud['lufs']} LUFS, true peak {loud['true_peak_db']} dBFS  (BPM {tl['grid']['bpm']}, {sum(e['bars'] for e in tl['entries'])} bars)")
            if fmt == "9x16":
                audio.mix(tl, silent, config.OUT / "owll-promo-9x16-nomusic.mp4", with_music=False)
        audio.write_credits(config.OUT / "CREDITS.txt", audio.analyze_music(), {})
    if "gif" in steps:
        import extras

        extras.make_gif(sb)
    if "thumb" in steps:
        import extras

        extras.make_thumbnail(sb)
    print(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
