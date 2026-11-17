"""Makes the synthetic demo content: a German article, a German sign, a short video with made-up subtitles and a Word file.
Everything here is invented for the demo (no real people, no photos, no copyrighted text)."""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
from config import ASSETS, FFMPEG, FONT, FONT_BOLD  # noqa: E402

ARTICLE = [
    "Die Stadtbibliothek öffnet am Samstag nach dem Umbau wieder ihre Türen. Der Eintritt ist für alle frei.",
    "Es gibt neue Leseecken, einen Raum für Kinder und ein kleines Café im Erdgeschoss.",
]

SUBTITLES = [  # made-up dialogue: (start, end, text)
    (1.0, 3.8, "Guten Morgen! Ist das Café schon geöffnet?"),
    (4.2, 7.2, "Natürlich, setzen Sie sich. Was darf es sein?"),
    (7.6, 10.8, "Einen Kaffee und ein Stück Apfelkuchen, bitte."),
    (11.2, 14.2, "Der Kuchen ist heute ganz frisch gebacken."),
]


def page(title: str, body: str, extra_css: str = "") -> str:
    return f"""<!doctype html><html lang="de"><head><meta charset="utf-8"><title>{title}</title><style>
html,body{{margin:0;height:100%;background:#f4f4f6;font-family:'Segoe UI',sans-serif;color:#222}}
main{{max-width:760px;margin:0 auto;padding:56px 40px}}
h1{{font-size:34px;margin:0 0 6px}} .meta{{color:#888;margin-bottom:28px}}
p{{font-size:24px;line-height:1.55;margin:0 0 20px}} {extra_css}</style></head><body><main>{body}</main></body></html>"""


def make_article():
    body = "<h1>Neues aus der Stadt</h1><div class='meta'>Lokales &middot; Kultur</div>" + "".join(f"<p>{p}</p>" for p in ARTICLE)
    (ASSETS / "article.html").write_text(page("Neues aus der Stadt", body), encoding="utf-8")


def make_sign():
    w, h = 1100, 700
    im = Image.new("RGB", (w, h), (214, 205, 190))
    d = ImageDraw.Draw(im)
    for y in range(0, h, 10):  # a plain wall texture
        d.line([(0, y), (w, y)], fill=(208 + (y % 20) // 4, 199, 184), width=1)
    d.rounded_rectangle((90, 110, w - 90, h - 110), 28, fill=(28, 52, 98), outline=(240, 240, 240), width=10)
    f1, f2 = ImageFont.truetype(FONT_BOLD, 92), ImageFont.truetype(FONT, 50)
    d.text((w / 2, 255), "Bitte leise sein", font=f1, fill=(255, 255, 255), anchor="mm")
    d.text((w / 2, 385), "Die Bibliothek schließt", font=f2, fill=(235, 238, 250), anchor="mm")
    d.text((w / 2, 450), "heute um 18 Uhr.", font=f2, fill=(235, 238, 250), anchor="mm")
    im.save(ASSETS / "sign.png")
    body = "<img src='sign.png' style='display:block;margin:0 auto;max-width:100%'>"
    (ASSETS / "sign.html").write_text(page("Schild", body, "main{max-width:1100px;padding:30px} body{background:#222}"), encoding="utf-8")


def make_video():
    textfiles = []
    filt = ["[0:v]format=yuv420p[bg]"]
    last = "bg"
    for i, (a, b, text) in enumerate(SUBTITLES):
        tf = ASSETS / f"sub{i}.txt"
        tf.write_text(text, encoding="utf-8")
        textfiles.append(tf)
        out = f"s{i}"
        path = str(tf).replace("\\", "/").replace(":", r"\:")
        font = FONT.replace("\\", "/").replace(":", r"\:")
        filt.append(f"[{last}]drawtext=fontfile='{font}':textfile='{path}':fontsize=52:fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=14:x=(w-text_w)/2:y=h-120:enable='between(t,{a},{b})'[{out}]")
        last = out
    cmd = [str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
           "gradients=s=1280x720:r=30:d=18:c0=0x2b3a67:c1=0xe0a458:c2=0x6d2ef0:x0=0:y0=0:x1=1280:y1=720:speed=0.012:n=3",
           "-filter_complex", ";".join(filt), "-map", f"[{last}]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", str(ASSETS / "video.mp4")]
    subprocess.run(cmd, check=True)
    subprocess.run([str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-ss", "0.2", "-i", str(ASSETS / "video.mp4"), "-frames:v", "1", str(ASSETS / "poster.png")], check=True)
    body = "<video id='v' src='video.mp4' style='display:block;width:100%' muted playsinline></video>"
    (ASSETS / "video.html").write_text(page("Video", body, "main{max-width:1180px;padding:20px} body{background:#111}"), encoding="utf-8")


def make_docx():
    from docx import Document
    from docx.shared import Pt, RGBColor

    doc = Document()
    doc.styles["Normal"].font.name = "Calibri"
    doc.styles["Normal"].font.size = Pt(12)
    h = doc.add_heading("Einladung zum Sommerfest", 0)
    h.runs[0].font.color.rgb = RGBColor(0x6D, 0x2E, 0xF0)
    p = doc.add_paragraph("Liebe Nachbarinnen und Nachbarn, wir laden Sie herzlich zu unserem ")
    p.add_run("Sommerfest im Hof").bold = True
    p.add_run(" ein. Es gibt Musik, Essen und Spiele für Kinder.")
    doc.add_heading("Was Sie erwartet", 1)
    for t in ("Kaffee und selbstgebackener Kuchen", "Ein Spielplatz für die Kleinen", "Livemusik am Abend"):
        doc.add_paragraph(t, style="List Bullet")
    doc.add_heading("Programm", 1)
    table = doc.add_table(rows=3, cols=2)
    table.style = "Light Grid Accent 1"
    rows = (("Uhrzeit", "Programmpunkt"), ("15:00", "Eröffnung und Kaffeetrinken"), ("18:00", "Konzert im Hof"))
    for r, (a, b) in enumerate(rows):
        table.cell(r, 0).text, table.cell(r, 1).text = a, b
    doc.add_paragraph("Wir freuen uns auf Ihren Besuch.")
    doc.save(ASSETS / "Einladung.docx")


if __name__ == "__main__":
    ASSETS.mkdir(parents=True, exist_ok=True)
    make_article()
    make_sign()
    make_video()
    make_docx()
    print("assets in", ASSETS)
