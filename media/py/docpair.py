"""Renders the first page of a .docx to a PNG (Word, invisible, exports a PDF; PyMuPDF makes the picture) and shows the original and the
translated page side by side (see docview.py). If Word is not installed the scene says so and the caption should be dropped."""
import subprocess
import sys
from pathlib import Path

import pymupdf as fitz  # PyMuPDF

from config import MEDIA, WORK


def docx_to_png(docx: Path, name: str, width: int = 900, top_fraction: float = 0.68) -> Path:
    pdf = WORK / f"{name}.pdf"
    pdf.unlink(missing_ok=True)
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(MEDIA / "ps" / "docx-to-pdf.ps1"), "-Docx", str(docx), "-Pdf", str(pdf)],
                   check=True, capture_output=True, timeout=120)
    page = fitz.open(str(pdf))[0]
    zoom = width / page.rect.width
    png = WORK / f"{name}.png"
    clip = fitz.Rect(0, 0, page.rect.width, page.rect.height * top_fraction)  # the top of the page is where the content is
    page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip).save(str(png))
    return png


def start_viewer(left: Path, right: Path, x: int, y: int, w: int, h: int):
    proc = subprocess.Popen([sys.executable, str(MEDIA / "py" / "docview.py"), str(left), str(right), str(x), str(y), str(w), str(h)], stdout=subprocess.PIPE, text=True)
    proc.stdout.readline()
    return proc
