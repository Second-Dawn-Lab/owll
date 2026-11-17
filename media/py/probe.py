"""Developer helper: starts the demo build on the fake profile and prints what the automation can see (windows, DOM)."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import auto
import stage

stage.preflight()
x0, y0, w, h = stage.region()
with stage.Backdrop():
    app = stage.OwlApp().start(x0 + 560, 120, 1280, 840)
    print("targets:", [(t["type"], t["title"], t["url"]) for t in auto.Page.targets(stage.CDP_APP)])
    print(app.main.js("document.documentElement.dataset.window"))
    print(app.main.js("[...document.querySelectorAll('button,[role=tab],textarea,[aria-label]')].slice(0,40).map(e=>e.tagName+'|'+(e.className||'')+'|'+(e.getAttribute('aria-label')||e.innerText||'').slice(0,40)).join('\\n')"))
    print("main rect", auto.window_rect(app.hwnd))
    time.sleep(3)
    app.stop()
