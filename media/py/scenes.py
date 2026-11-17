"""The recorded scenes. Each one is its own clip (CLIPS/<name>.mp4 + .json) so it can be re-recorded alone.
All content is made up (see make_assets.py). Every scene starts the demo build fresh on the throw-away profile."""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

import auto
import stage
import config
from config import ASSETS, MEDIA
from record import Recording

X0, Y0, RW, RH = stage.region()
USER32 = auto.user32
DE_TO_EN = {"targetLanguage": "en", "lastForeignTarget": "en", "sourceLanguage": "auto"}
SENTENCE = "The new library opens on Saturday, and entry is free for everyone."
WORK_FLAG = Path(ASSETS).parent / "play.flag"
WRITE_TEXT = "i and me go zoo"


def at(dx: int, dy: int) -> tuple[int, int]:
    """Region-relative to screen coordinates."""
    return X0 + dx, Y0 + dy


def hide(hwnd: int) -> None:
    """Closes the main window the way a user does: with closeBehavior "background" the app keeps running in the tray."""
    USER32.PostMessageW(hwnd, 0x0010, 0, 0)  # WM_CLOSE
    time.sleep(0.8)


def start_viewer(image: Path, x: int, y: int, width: int):
    proc = subprocess.Popen([sys.executable, str(MEDIA / "py" / "viewer.py"), str(image), str(x), str(y), str(width)], stdout=subprocess.PIPE, text=True)
    l, t, r, b = (int(v) for v in proc.stdout.readline().split())
    hwnd = auto.wait_for_window("Notice", 10)
    auto.make_topmost(hwnd)
    return proc, (l, t, r, b), hwnd


def pause(s: float) -> None:
    time.sleep(s)


def wait_text(page: auto.Page, selector: str, timeout: float = 40, contains: str | None = None) -> str:
    end = time.time() + timeout
    while time.time() < end:
        t = page.text(selector).strip()
        if t and (contains is None or contains in t):
            return t
        time.sleep(0.25)
    raise TimeoutError(f"{selector} stayed empty")


def wait_for(page: auto.Page, selector: str, timeout: float = 40, required: bool = True):
    end = time.time() + timeout
    while time.time() < end:
        r = page.rect(selector)
        if r:
            return r
        time.sleep(0.2)
    if required:
        raise TimeoutError(f"{selector} did not appear")
    return None


def click_el(page: auto.Page, selector: str, text: str | None = None, fx: float = 0.5, fy: float = 0.5):
    r = page.wait_rect(selector, text)
    auto.click(*auto.center(r, fx, fy))
    return r


def warm_up_translation(app: stage.OwlApp) -> None:
    """Loads the models off camera, so the recorded translation shows the normal speed, not the first-use delay."""
    page = app.main
    ta = page.wait_rect("textarea")
    auto.click(*auto.center(ta))
    auto.type_text("Good morning, how are you today?", 0.5)
    wait_text(page, ".pane__result", 60)
    wait_for(page, ".pane__via--polished", 90)
    wait_for(page, ".sentalts__item", 40, required=False)
    pause(1.0)
    auto.hotkey("ctrl", "a")
    auto.tap("delete")
    pause(0.8)


# ---------------------------------------------------------------------------------------------------------------------
def scene_text(bd) -> None:
    app = stage.OwlApp().start(*at(560, 150), 1280, 820)
    try:
        warm_up_translation(app)
        page = app.main
        with Recording("02-text") as rec:
            rec.mark("window", rect=auto.window_rect(app.hwnd))
            pause(0.8)
            auto.click(*auto.center(page.wait_rect("textarea"), 0.5, 0.2))
            auto.type_text(SENTENCE, 0.6)
            rec.mark("typed", rect=page.wait_rect(".pane"))
            wait_text(page, ".pane__result", 40)
            rec.mark("translated")
            rec.mark("result", rect=page.wait_rect(".pane--result"))
            wait_for(page, ".pane__via--polished", 40, required=False)
            rec.mark("polished")
            alt = wait_for(page, ".sentalts__item", 25, required=False)
            pause(1.6)
            if alt:
                rec.mark("alt", rect=alt)
                auto.click(*auto.center(alt, 0.5, 0.5))
                rec.mark("alt-clicked")
            pause(2.2)
    finally:
        app.stop()


def scene_popup(bd) -> None:
    proc = subprocess.Popen([sys.executable, str(MEDIA / "py" / "article.py"), *(str(v) for v in (*at(250, 180), 1100, 640))], stdout=subprocess.PIPE, text=True)
    para = tuple(int(v) for v in proc.stdout.readline().split())
    win = auto.wait_for_window("Neues aus der Stadt", 10)
    auto.make_topmost(win)
    app = stage.OwlApp(DE_TO_EN).start(*at(1500, 300), 800, 600)
    try:
        hide(app.hwnd)
        auto.focus(win)
        pause(1.0)
        with Recording("03-popup") as rec:
            rec.mark("window", rect=auto.window_rect(win))
            pause(0.8)
            x, y = auto.center(para, 0.3, 0.2)
            auto.click(x, y, count=3)  # a triple click selects the paragraph
            pause(0.9)
            rec.mark("selected", rect=para)
            auto.double_ctrl_c()
            popup = auto.wait_for_window("Owl-L quick", 15)
            quick = auto.Page.attach_label("quick", stage.CDP_APP, 10)
            end = time.time() + 40
            while time.time() < end and ("Translating" in quick.text("body") or len(quick.text("body")) < 60):
                time.sleep(0.2)
            rec.mark("translated")
            end = time.time() + 6  # Quality mode: the footer first says "Loading model...", then "Polishing..."
            while time.time() < end and not any(w in quick.text("body") for w in ("Loading model", "Polishing")):
                time.sleep(0.1)
            end = time.time() + 40
            while time.time() < end and any(w in quick.text("body") for w in ("Loading model", "Polishing")):
                time.sleep(0.2)
            rec.mark("polished")
            pause(0.4)
            rec.mark("popup", rect=auto.window_rect(popup))
            pause(2.4)
    finally:
        app.stop()
        proc.terminate()


def scene_capture(bd) -> None:
    viewer, pic, vhwnd = start_viewer(ASSETS / "sign.png", *at(160, 200), 900)
    app = stage.OwlApp(DE_TO_EN).start(*at(1180, 170), 1180, 820)
    try:
        hide(app.hwnd)
        auto.focus(vhwnd)
        pause(1.0)
        with Recording("04-capture") as rec:
            rec.mark("window", rect=auto.window_rect(vhwnd))
            pause(0.9)
            auto.hotkey("ctrl", "shift", "o")
            pause(1.4)
            l, t, r, b = pic
            w, h = r - l, b - t
            box = (l + w * 0.17, t + h * 0.22, l + w * 0.83, t + h * 0.78)
            rec.mark("overlay")
            auto.drag(box[0], box[1], box[2], box[3], duration=1.0)
            rec.mark("box", rect=box)
            main = auto.wait_for_window("Owl-L", 25)
            page = auto.Page.attach_label("main", stage.CDP_APP, 10)
            end = time.time() + 40
            while time.time() < end and not page.text(".pane__result").strip():
                time.sleep(0.2)
            rec.mark("translated")
            rec.mark("result", rect=auto.window_rect(main))
            wait_for(page, ".pane__via--polished", 45, required=False)
            rec.mark("polished")
            pause(3.0)
    finally:
        app.stop()
        viewer.terminate()


def scene_live(bd) -> None:
    flag = WORK_FLAG
    flag.unlink(missing_ok=True)
    vx, vy, vw, vh = *at(220, 160), 1040, 585
    vid = subprocess.Popen(["powershell", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", str(MEDIA / "ps" / "video-window.ps1"),
                            "-Video", str(ASSETS / "video.mp4"), "-Poster", str(ASSETS / "poster.png"), "-Flag", str(flag), "-X", str(vx), "-Y", str(vy), "-W", str(vw), "-H", str(vh)])
    app = stage.OwlApp(DE_TO_EN).start(*at(1500, 150), 800, 600)
    try:
        vhwnd = auto.wait_for_window("owll-demo-video", 20)
        auto.make_topmost(vhwnd)
        hide(app.hwnd)
        auto.focus(vhwnd)
        pause(1.5)
        rect = auto.window_rect(vhwnd)
        with Recording("05-live") as rec:
            rec.mark("window", rect=rect)
            pause(0.8)
            auto.hotkey("ctrl", "shift", "l")
            pause(1.4)
            l, t, r, b = rect
            w, h = r - l, b - t
            box = (l + w * 0.04, t + h * 0.76, l + w * 0.96, t + h * 0.98)
            auto.drag(box[0], box[1], box[2], box[3], duration=1.0)
            rec.mark("box", rect=box)
            pause(0.8)
            flag.write_text("play")
            pause(1.0)
            bar = None
            end = time.time() + 15
            while time.time() < end and not bar:
                found = auto.find_windows("live captions")
                bar = found[0] if found else None
                time.sleep(0.3)
            pause(9.0)
            if bar:
                rec.mark("bar", rect=auto.window_rect(bar))
            pause(1.5)
    finally:
        flag.unlink(missing_ok=True)
        app.stop()
        vid.terminate()


def scene_docs(bd) -> None:
    import docpair

    for old in ASSETS.glob("Einladung (EN)*.docx"):  # results of earlier runs
        old.unlink()
    original_png = docpair.docx_to_png(ASSETS / "Einladung.docx", "doc-original")
    app = stage.OwlApp({"filesTargetLanguage": "en"}).start(*at(560, 150), 1280, 820)
    ps = subprocess.Popen(["powershell", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", str(MEDIA / "ps" / "desktop-file.ps1"),
                           "-File", str(ASSETS / "Einladung.docx"), "-X", str(X0 + 180), "-Y", str(Y0 + 420)])
    try:
        icon = auto.wait_for_window("owll-demo-file", 20)
        auto.make_topmost(icon)
        page = app.main
        click_el(page, ".dw-nav__item", "Files")
        pause(1.0)
        drop = page.wait_rect(".files__drop, .files")
        with Recording("06-docs") as rec:
            rec.mark("window", rect=auto.window_rect(app.hwnd))
            pause(0.8)
            ir = auto.window_rect(icon)
            auto.drag(ir[0] + 75, ir[1] + 50, *auto.center(drop), duration=1.3)
            pause(1.4)
            rec.mark("list", rect=page.wait_rect(".files__list"))
            pause(0.8)
            click_el(page, "button", "Translate 1")
            rec.mark("started")
            # The system "Save as" dialog is moved out of the recorded area (its folder list is the real one of this PC), then confirmed.
            end = time.time() + 15
            while time.time() < end:
                dlg = auto.find_windows("Save As")
                if dlg:
                    auto.place(dlg[0], X0 + RW + 120, 500, 900, 560)
                    time.sleep(0.5)
                    auto.focus(dlg[0])
                    auto.tap("enter")
                    break
                time.sleep(0.05)
            wait_for(page, ".files__row--done", 120)
            rec.mark("done", rect=page.wait_rect(".files__list"))
            pause(1.5)
            result = next(iter(sorted(ASSETS.glob("Einladung (EN)*.docx"))), None)
            if result is None:
                raise RuntimeError("the translated file was not found")
            translated_png = docpair.docx_to_png(result, "doc-translated")  # Word renders it invisibly; the recording keeps running
            rec.mark("rendered")
            view = docpair.start_viewer(original_png, translated_png, *at(560, 150), 1280, 820)
            try:
                vhwnd = auto.wait_for_window("Documents", 10)
                auto.make_topmost(vhwnd)
                pause(0.4)
                rec.mark("docview", rect=auto.window_rect(vhwnd))
                pause(3.6)
            finally:
                view.terminate()
            pause(1.5)
    finally:
        ps.terminate()
        app.stop()


def scene_write(bd) -> None:
    app = stage.OwlApp().start(*at(560, 150), 1280, 820)
    try:
        page = app.main
        click_el(page, ".dw-nav__item", "Write")
        pause(1.2)
        field = 'textarea[aria-label="Your text"]'
        # warm-up (loads the writing model off camera)
        auto.click(*auto.center(page.wait_rect(field), 0.5, 0.2))
        auto.type_text("he go to school", 0.4)
        click_el(page, "button", "Fix grammar")
        wait_for(page, ".write-change", 120)
        pause(1.5)
        auto.click(*auto.center(page.wait_rect(field), 0.5, 0.2))  # the button took the focus: back into the text box, then clear it
        auto.hotkey("ctrl", "a")
        auto.tap("delete")
        pause(1.0)
        with Recording("07-write") as rec:
            rec.mark("window", rect=auto.window_rect(app.hwnd))
            pause(0.8)
            auto.click(*auto.center(page.wait_rect(field), 0.5, 0.2))
            auto.type_text(WRITE_TEXT, 0.8)
            rec.mark("typed")
            pause(0.6)
            click_el(page, "button", "Fix grammar")
            rec.mark("clicked")
            wait_for(page, ".write-change", 120)
            rec.mark("result", rect=page.wait_rect(".write-diff"))
            pause(2.8)
            ch = page.rect(".write-change", None)
            if ch:  # undo one change, then redo it: the changes are clickable
                auto.click(*auto.center(ch))
                pause(1.0)
                auto.click(*auto.center(ch))
            pause(1.6)
    finally:
        app.stop()


def scene_meeting(bd) -> None:
    flag = WORK_FLAG
    flag.unlink(missing_ok=True)
    proc = subprocess.Popen([sys.executable, str(MEDIA / "py" / "callwin.py"), *(str(v) for v in at(300, 90)), str(flag)], stdout=subprocess.PIPE, text=True)
    area = tuple(int(v) for v in proc.stdout.readline().split())
    win = auto.wait_for_window("Team call", 10)
    auto.make_topmost(win)
    app = stage.OwlApp({**DE_TO_EN, "liveLines": 3, "liveBarWidth": 1000, "liveBarHeight": 300, "liveFontSize": 30}).start(*at(1500, 150), 800, 600)
    try:
        hide(app.hwnd)
        auto.focus(win)
        pause(1.2)
        with Recording("05b-meeting") as rec:
            rec.mark("window", rect=auto.window_rect(win))
            pause(0.8)
            auto.hotkey("ctrl", "shift", "l")
            pause(1.4)
            l, t, r, b = area
            auto.drag(l - 4, t - 6, r + 4, b + 2, duration=1.0)
            rec.mark("box", rect=area)
            pause(0.8)
            flag.write_text("go")
            rec.mark("speech-starts")
            bar = None
            end = time.time() + 20
            while time.time() < end and not bar:
                found = auto.find_windows("live captions")
                bar = found[0] if found else None
                time.sleep(0.3)
            pause(10.0)
            if bar:
                rec.mark("bar", rect=auto.window_rect(bar))
            pause(10.5)
            if bar:
                rec.mark("bar-end", rect=auto.window_rect(bar))
            pause(1.5)
    finally:
        flag.unlink(missing_ok=True)
        app.stop()
        proc.terminate()


SCENES = {
    "02-text": scene_text,
    "03-popup": scene_popup,
    "04-capture": scene_capture,
    "05-live": scene_live,
    "05b-meeting": scene_meeting,
    "06-docs": scene_docs,
    "07-write": scene_write,
}


def record(names: list[str]) -> None:
    stage.preflight()
    with stage.Backdrop() as bd:
        for n in names:
            print(f"recording {n} ...")
            try:
                SCENES[n](bd)
            except Exception as e:  # keep going with the other scenes
                print(f"  FAILED {n}: {type(e).__name__}: {e}", file=sys.stderr)
                try:
                    from PIL import ImageGrab

                    ImageGrab.grab(all_screens=True).save(str(config.WORK / f"failed-{n}.png"))
                except Exception:
                    pass
