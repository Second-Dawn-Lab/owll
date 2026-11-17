"""The set: a neutral backdrop over the desktop, clean Edge app windows with made-up pages, and the demo build of Owl-L
running on a throw-away profile (never the real settings, history or glossary)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import auto
from config import APP_EXE, ASSETS, REC_H, REC_W, WORK

PROFILE = WORK / "profile"
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
CDP_APP, CDP_EDGE = 9222, 9223

user32 = auto.user32


def screen_size() -> tuple[int, int]:
    return user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)


def region() -> tuple[int, int, int, int]:
    """The recorded rectangle: REC_W x REC_H, centered horizontally, at the top of the primary monitor
    (the taskbar and the notification corner stay outside of it)."""
    sw, sh = screen_size()
    return (sw - REC_W) // 2, 0, REC_W, REC_H


def preflight() -> None:
    sw, sh = screen_size()
    if sh < REC_H or sw < REC_W:
        raise SystemExit(f"The screen is {sw}x{sh}; the recording needs at least {REC_W}x{REC_H}.")
    dpi = ctypes_dpi()
    if dpi != 96:
        raise SystemExit(f"Display scaling is {dpi / 96 * 100:.0f}%, not 100%. Set it to 100% (Settings, Display) for the recording.")
    if auto.find_windows("Owl-L") and not os.environ.get("OWLL_MEDIA_KEEP_APP"):
        owl = [p for p in running("owll.exe")]
        if owl:
            raise SystemExit("Owl-L is already running (the installed copy?). Quit it from its tray icon first: only one Owl-L can run at a time.")
    if not APP_EXE.exists():
        raise SystemExit(f"The demo build is missing: {APP_EXE}\nBuild it: see media/README.md (pnpm tauri build --no-bundle --features demo-capture).")


def ctypes_dpi() -> int:
    import ctypes

    return ctypes.windll.user32.GetDpiForSystem()


def running(name: str) -> list[str]:
    out = subprocess.run(["tasklist", "/FI", f"IMAGENAME eq {name}", "/FO", "CSV", "/NH"], capture_output=True, text=True).stdout
    return [line for line in out.splitlines() if name.lower() in line.lower()]


# --- backdrop --------------------------------------------------------------------------------------------------------
BACKDROP_PY = r'''
import tkinter as tk
root = tk.Tk()
root.overrideredirect(True)
w, h = root.winfo_screenwidth(), root.winfo_screenheight()
root.geometry(f"{w}x{h}+0+0")
c = tk.Canvas(root, width=w, height=h, highlightthickness=0, bg="#e9ebf2")
c.pack()
# a soft vertical gradient in neutral blue-grey
top, bot = (233, 236, 246), (205, 210, 228)
for y in range(0, h, 4):
    t = y / h
    col = "#%02x%02x%02x" % tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    c.create_rectangle(0, y, w, y + 4, outline=col, fill=col)
root.attributes("-topmost", True)
root.title("owll-demo-backdrop")
root.mainloop()
'''


class Backdrop:
    def __init__(self):
        self.proc: subprocess.Popen | None = None

    def __enter__(self):
        pyw = Path(sys.executable)
        self.proc = subprocess.Popen([str(pyw), "-c", BACKDROP_PY])
        auto.wait_for_window("owll-demo-backdrop", 10)
        return self

    def __exit__(self, *a):
        if self.proc:
            self.proc.terminate()


# --- Edge app windows ------------------------------------------------------------------------------------------------
class EdgeWindow:
    """A bare Edge window (app mode, empty temporary profile) showing one of the made-up pages."""

    def __init__(self, page: str, x: int, y: int, w: int, h: int, port: int = CDP_EDGE):
        profile = WORK / "edge-profile"
        profile.mkdir(parents=True, exist_ok=True)
        url = (ASSETS / page).as_uri()
        args = [str(EDGE), f"--app={url}", f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
                f"--window-position={x},{y}", f"--window-size={w},{h}", f"--remote-debugging-port={port}",
                "--autoplay-policy=no-user-gesture-required", "--disable-notifications", "--disable-features=Translate,msEdgeSidebar,msHub",
                "--disable-sync", "--disable-extensions", "--hide-crash-restore-bubble", "--lang=de"]
        self.proc = subprocess.Popen(args)
        self.hwnd = 0
        self.page: auto.Page | None = None
        self.port = port
        self.title = ""

    def ready(self, title_part: str) -> "EdgeWindow":
        self.title = title_part
        self.hwnd = auto.wait_for_window(title_part, 30)
        auto.make_topmost(self.hwnd)
        self.page = auto.Page.attach(title_part=title_part, port=self.port, timeout=30)
        return self

    def close(self):
        if self.page:
            self.page.close()
        try:
            auto.user32.PostMessageW(self.hwnd, 0x0010, 0, 0)  # WM_CLOSE
        except Exception:
            pass
        time.sleep(0.5)
        self.proc.terminate()


# --- the app ---------------------------------------------------------------------------------------------------------
SETTINGS = {
    "launchAtStart": False, "closeBehavior": "background", "quickAccess": "popup", "ignoreQuickAccessWithoutSelection": False,
    "floatingIcon": False, "translateShortcutEnabled": True, "translateShortcut": "Ctrl+C C", "captureShortcutEnabled": True,
    "captureShortcut": "Ctrl+Shift+O", "theme": "light", "uiLanguage": "en", "downloadLocation": "ask", "keepHistory": False,
    "captureLanguages": [], "blockList": [], "proxyEnabled": False, "proxyUrl": "", "translationThreads": 0, "twoPass": False,
    "sourceLanguage": "en", "targetLanguage": "de", "lastForeignTarget": "de", "lastUpdateCheck": 4102444800, "onboardingDone": True,
    "captureResultIn": "main", "glossaryActive": "", "pdfOutput": "docx", "pdfAsk": False, "filesTargetLanguage": "en",
    "liveShortcutEnabled": True, "liveShortcut": "Ctrl+Shift+L", "liveSpeed": "fast", "liveLines": 2, "liveFontSize": 30,
    "liveOpacity": 0.92, "liveShowOriginal": False, "liveSaveChoice": "never", "liveBarWidth": 0, "liveBarHeight": 0,
    "qualityMode": "builtin", "qualityModel": "hy-mt2-1.8b-q4km", "ollamaModel": "", "ollamaEndpoint": "127.0.0.1:11434",
    "qualityIdleMinutes": 15, "qualityShowFast": False, "tone": "automatic", "livePolish": False, "liveMeeting": "auto",
    "filesPolish": False,
}


def real_models_dir() -> Path:
    return Path(os.environ["APPDATA"]) / "SecondDawn" / "models"


def prepare_profile(overrides: dict | None = None) -> dict[str, str]:
    """A fresh fake profile under media/work: its own settings, no history, no glossary. The (read-only) model store of the real
    profile is linked in with a directory junction, so nothing has to be downloaded or copied."""
    roaming = PROFILE / "Roaming"
    local = PROFILE / "Local"
    wv = PROFILE / "WebView2"
    if roaming.exists():
        subprocess.run(["cmd", "/c", "rmdir", "/S", "/Q", str(roaming / "SecondDawn" / "owll")], capture_output=True)
    (roaming / "SecondDawn" / "owll").mkdir(parents=True, exist_ok=True)
    local.mkdir(parents=True, exist_ok=True)
    wv.mkdir(parents=True, exist_ok=True)
    link = roaming / "SecondDawn" / "models"
    if not link.exists():
        subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(real_models_dir())], check=True, capture_output=True)
    settings = dict(SETTINGS)
    settings.update(overrides or {})
    (roaming / "SecondDawn" / "owll" / "settings.json").write_text(json.dumps(settings, indent=2), encoding="utf-8")
    env = dict(os.environ)
    env.update({
        "APPDATA": str(roaming), "LOCALAPPDATA": str(local),
        "WEBVIEW2_USER_DATA_FOLDER": str(wv),
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS": f"--remote-debugging-port={CDP_APP} --remote-allow-origins=*",
        "OWLL_DEMO_CAPTURE": "1",
    })
    return env


class OwlApp:
    def __init__(self, overrides: dict | None = None):
        self.env = prepare_profile(overrides)
        self.proc: subprocess.Popen | None = None
        self.main: auto.Page | None = None
        self.hwnd = 0

    def start(self, x: int, y: int, w: int, h: int) -> "OwlApp":
        self.proc = subprocess.Popen([str(APP_EXE)], env=self.env, cwd=str(APP_EXE.parent))
        self.hwnd = auto.wait_for_window("Owl-L", 40)
        self.main = auto.Page.attach_label("main", port=CDP_APP, timeout=40)
        auto.place(self.hwnd, x, y, w, h)
        auto.make_topmost(self.hwnd)
        time.sleep(1.0)
        auto.focus(self.hwnd)
        return self

    def stop(self):
        if self.main:
            self.main.close()
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
