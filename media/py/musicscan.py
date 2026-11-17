"""Developer helper (promo v2): reads OpenGameArt pages, keeps CC0 music, downloads the mp3s and measures tempo and energy."""
import html, json, re, subprocess, sys, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from config import WORK

PAGES = WORK / "music" / "pages"
want = sys.argv[1:]
res = {}
for href in ["/" + w.lstrip("/") for w in want]:
    url = "https://opengameart.org" + href
    page = PAGES / (href.strip("/").replace("/", "_") + ".html")
    if not page.exists():
        page.write_text(subprocess.run(["curl", "-s", "-m", "25", "-L", url], capture_output=True, text=True, encoding="utf-8", errors="ignore").stdout, encoding="utf-8")
    s = page.read_text(encoding="utf-8", errors="ignore")
    title = re.search(r"<title>(.*?)\s*\|", s, re.S)
    lic = re.findall(r"creativecommons.org/(publicdomain/zero/1.0|licenses/[a-z\-]+/[\d.]+)", s)
    author = re.search(r'<span class="username"[^>]*>(.*?)</span>|class="username"[^>]*>(.*?)<', s, re.S)
    tags = re.findall(r'<a href="/art-search\?[^"]*field_art_tags_tid[^"]*"[^>]*>(.*?)</a>', s)
    files = re.findall(r'href="(https://opengameart.org/sites/default/files/[^"]+\.(?:mp3|ogg|wav))"', s)
    res[href] = {"title": html.unescape(title.group(1)).strip() if title else "", "licenses": sorted(set(lic)), "author": re.sub("<[^>]+>", "", (author.group(1) or author.group(2) or "")).strip() if author else "", "tags": [re.sub("<[^>]+>", "", t) for t in tags], "files": files}
json.dump(res, open(WORK / "music" / "pages" / "scan.json", "w"), indent=1)
for h, r in res.items():
    print(h, "|", r["title"], "|", r["author"], "|", r["licenses"], "|", r["tags"][:6], "|", [f.split("/")[-1] for f in r["files"]][:3])
