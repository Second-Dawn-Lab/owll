"""Windows input and window helpers for the demo recording: human-like mouse motion and typing with SendInput, plus
a small Chrome DevTools Protocol client to find where things are inside the app's WebView2 windows.
No third-party packages except websocket-client (see requirements.txt)."""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import json
import math
import random
import time
import urllib.request

user32 = ctypes.windll.user32
user32.SetProcessDPIAware()

INPUT_MOUSE, INPUT_KEYBOARD = 0, 1
MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_WHEEL = 0x0002, 0x0004, 0x0800
KEYEVENTF_KEYUP, KEYEVENTF_UNICODE = 0x0002, 0x0004

VK = {"ctrl": 0x11, "shift": 0x10, "alt": 0x12, "enter": 0x0D, "esc": 0x1B, "tab": 0x09, "backspace": 0x08, "delete": 0x2E,
      "win": 0x5B, "space": 0x20, "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28, "home": 0x24, "end": 0x23}
for _c in "abcdefghijklmnopqrstuvwxyz":
    VK[_c] = ord(_c.upper())
for _d in "0123456789":
    VK[_d] = ord(_d)


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wt.LONG), ("dy", wt.LONG), ("mouseData", wt.DWORD), ("dwFlags", wt.DWORD), ("time", wt.DWORD),
                ("dwExtraInfo", ctypes.POINTER(wt.ULONG))]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wt.WORD), ("wScan", wt.WORD), ("dwFlags", wt.DWORD), ("time", wt.DWORD),
                ("dwExtraInfo", ctypes.POINTER(wt.ULONG))]


class _U(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ("u",)
    _fields_ = [("type", wt.DWORD), ("u", _U)]


def _send(*inputs: INPUT) -> None:
    arr = (INPUT * len(inputs))(*inputs)
    user32.SendInput(len(inputs), arr, ctypes.sizeof(INPUT))


def _key(vk: int = 0, scan: int = 0, flags: int = 0) -> INPUT:
    i = INPUT(type=INPUT_KEYBOARD)
    i.ki = KEYBDINPUT(vk, scan, flags, 0, None)
    return i


def _mouse(flags: int, data: int = 0) -> INPUT:
    i = INPUT(type=INPUT_MOUSE)
    i.mi = MOUSEINPUT(0, 0, data, flags, 0, None)
    return i


# --- mouse -----------------------------------------------------------------------------------------------------------
def cursor() -> tuple[int, int]:
    p = wt.POINT()
    user32.GetCursorPos(ctypes.byref(p))
    return p.x, p.y


def _ease(t: float) -> float:
    return t * t * t * (t * (6 * t - 15) + 10)  # smootherstep


def move(x: float, y: float, duration: float = 0.7, curve: float = 0.12) -> None:
    """Moves the pointer along a gentle arc with an eased speed (not a jump)."""
    x0, y0 = cursor()
    dx, dy = x - x0, y - y0
    dist = math.hypot(dx, dy)
    if dist < 2:
        return
    duration = max(0.15, min(duration, 0.25 + dist / 1400))
    nx, ny = -dy / dist, dx / dist
    bend = random.uniform(-1, 1) * curve * dist * 0.5
    steps = max(8, int(duration * 120))
    t0 = time.perf_counter()
    for i in range(1, steps + 1):
        t = _ease(i / steps)
        off = math.sin(math.pi * t) * bend
        user32.SetCursorPos(int(x0 + dx * t + nx * off), int(y0 + dy * t + ny * off))
        wait = t0 + duration * i / steps - time.perf_counter()
        if wait > 0:
            time.sleep(wait)
    user32.SetCursorPos(int(x), int(y))


def click(x: float | None = None, y: float | None = None, count: int = 1, pause: float = 0.12) -> None:
    if x is not None:
        move(x, y)
        time.sleep(0.12)
    for i in range(count):
        _send(_mouse(MOUSEEVENTF_LEFTDOWN))
        time.sleep(0.05)
        _send(_mouse(MOUSEEVENTF_LEFTUP))
        if i < count - 1:
            time.sleep(0.09)
    time.sleep(pause)


def drag(x0: float, y0: float, x1: float, y1: float, duration: float = 0.9) -> None:
    move(x0, y0)
    time.sleep(0.15)
    _send(_mouse(MOUSEEVENTF_LEFTDOWN))
    time.sleep(0.12)
    move(x1, y1, duration=duration, curve=0.03)
    time.sleep(0.12)
    _send(_mouse(MOUSEEVENTF_LEFTUP))
    time.sleep(0.15)


def scroll(clicks: int) -> None:
    _send(_mouse(MOUSEEVENTF_WHEEL, ctypes.c_ulong(clicks * 120).value))


# --- keyboard --------------------------------------------------------------------------------------------------------
def key_down(name: str) -> None:
    _send(_key(VK[name]))


def key_up(name: str) -> None:
    _send(_key(VK[name], flags=KEYEVENTF_KEYUP))


def hotkey(*names: str, hold: float = 0.06) -> None:
    for n in names:
        key_down(n)
        time.sleep(0.03)
    time.sleep(hold)
    for n in reversed(names):
        key_up(n)
        time.sleep(0.02)


def tap(name: str) -> None:
    key_down(name)
    time.sleep(0.04)
    key_up(name)


def double_ctrl_c(gap: float = 0.14) -> None:
    """Ctrl+C, release C, press C again with Ctrl still held: the quick-access shortcut (Ctrl+C+C)."""
    key_down("ctrl")
    time.sleep(0.03)
    tap("c")
    time.sleep(gap)
    tap("c")
    time.sleep(0.05)
    key_up("ctrl")


def type_text(text: str, speed: float = 1.0) -> None:
    """Types like a person: uneven pauses, a slightly longer one after spaces and punctuation."""
    for ch in text:
        code = ord(ch)
        _send(_key(0, code, KEYEVENTF_UNICODE), _key(0, code, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP))
        d = random.uniform(0.045, 0.105) * speed
        if ch in " ,.;!?":
            d += random.uniform(0.03, 0.09) * speed
        time.sleep(d)


# --- windows ---------------------------------------------------------------------------------------------------------
def find_windows(title_part: str, visible_only: bool = True) -> list[int]:
    found: list[int] = []
    buf = ctypes.create_unicode_buffer(512)

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def cb(hwnd, _):
        if visible_only and not user32.IsWindowVisible(hwnd):
            return True
        user32.GetWindowTextW(hwnd, buf, 512)
        if title_part.lower() in buf.value.lower():
            found.append(hwnd)
        return True

    user32.EnumWindows(cb, 0)
    return found


def window_rect(hwnd: int) -> tuple[int, int, int, int]:
    r = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def place(hwnd: int, x: int, y: int, w: int, h: int) -> None:
    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    user32.SetWindowPos.argtypes = [wt.HWND, wt.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
    user32.SetWindowPos(hwnd, wt.HWND(0), x, y, w, h, 0x0004 | 0x0040)  # NOZORDER | SHOWWINDOW


def make_topmost(hwnd: int) -> None:
    """Keeps a window above every normal window of the desktop (the backdrop is topmost too and is never activated, so it stays at the bottom of them)."""
    user32.SetWindowPos.argtypes = [wt.HWND, wt.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
    user32.SetWindowPos(hwnd, wt.HWND(-1), 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0010)  # HWND_TOPMOST, NOMOVE | NOSIZE | NOACTIVATE


def focus(hwnd: int) -> None:
    """Brings a window to the front (shares the input queue of the current foreground window for a moment, so Windows allows it)."""
    fg = user32.GetForegroundWindow()
    cur = ctypes.windll.kernel32.GetCurrentThreadId()
    fg_thread = user32.GetWindowThreadProcessId(fg, None)
    target_thread = user32.GetWindowThreadProcessId(hwnd, None)
    user32.ShowWindow(hwnd, 9)
    for t in {fg_thread, target_thread} - {cur}:
        user32.AttachThreadInput(cur, t, True)
    user32.BringWindowToTop(hwnd)
    user32.SetForegroundWindow(hwnd)
    for t in {fg_thread, target_thread} - {cur}:
        user32.AttachThreadInput(cur, t, False)
    time.sleep(0.25)


def wait_for_window(title_part: str, timeout: float = 30) -> int:
    end = time.time() + timeout
    while time.time() < end:
        w = find_windows(title_part)
        if w:
            return w[0]
        time.sleep(0.3)
    raise TimeoutError(f"no window with '{title_part}' after {timeout}s")


# --- Chrome DevTools Protocol (WebView2 started with --remote-debugging-port) ------------------------------------------
class Page:
    """One WebView2 window of the app (or an Edge window): evaluate JavaScript, find elements."""

    def __init__(self, ws_url: str):
        import websocket

        self.ws = websocket.create_connection(ws_url, timeout=20, suppress_origin=True)
        self._id = 0

    @staticmethod
    def targets(port: int = 9222) -> list[dict]:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=5) as r:
            return json.load(r)

    @classmethod
    def attach(cls, url_part: str = "", title_part: str = "", port: int = 9222, timeout: float = 30, exact: bool = False) -> "Page":
        end = time.time() + timeout
        while time.time() < end:
            try:
                for t in cls.targets(port):
                    if t.get("type") == "page" and url_part in t.get("url", "") and (t.get("title", "").lower() == title_part.lower() if exact else title_part.lower() in t.get("title", "").lower()):
                        return cls(t["webSocketDebuggerUrl"])
            except OSError:
                pass
            time.sleep(0.4)
        raise TimeoutError(f"no page with url '{url_part}' title '{title_part}'")

    @classmethod
    def attach_label(cls, label: str, port: int = 9222, timeout: float = 30) -> "Page":
        """The app's window with this label (main, quick, live, picker, overlay-N, settings): App.tsx writes it to <html data-window>."""
        end = time.time() + timeout
        while time.time() < end:
            try:
                for t in cls.targets(port):
                    if t.get("type") != "page":
                        continue
                    pg = cls(t["webSocketDebuggerUrl"])
                    try:
                        if pg.js("document.documentElement.dataset.window") == label:
                            return pg
                    except Exception:
                        pass
                    pg.close()
            except OSError:
                pass
            time.sleep(0.4)
        raise TimeoutError(f"no app window labelled {label}")

    def call(self, method: str, **params):
        self._id += 1
        self.ws.send(json.dumps({"id": self._id, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self._id:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg.get("result", {})

    def js(self, expr: str):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", "js error"))
        return r.get("result", {}).get("value")

    def rect(self, selector: str, text: str | None = None) -> tuple[float, float, float, float] | None:
        """The element's rectangle in SCREEN pixels (left, top, right, bottom) or None. `text` picks the first match containing it."""
        sel = json.dumps(selector)
        txt = json.dumps(text)
        v = self.js(f"""(() => {{
            const all = [...document.querySelectorAll({sel})];
            const el = {txt} === null ? all[0] : all.find(e => (e.innerText || e.value || e.getAttribute('aria-label') || '').toLowerCase().includes({txt}.toLowerCase()));
            if (!el) return null;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return null;
            return [r.left, r.top, r.right, r.bottom, window.screenX, window.screenY, window.outerWidth - window.innerWidth, window.outerHeight - window.innerHeight, window.devicePixelRatio];
        }})()""")
        if not v:
            return None
        l, t, r, b, sx, sy, dw, dh, dpr = v
        # The client area sits inside the window frame: borders left/right/bottom are dw/2 wide, the rest of the height is the title bar.
        ox = sx + dw / 2
        oy = sy + (dh - dw / 2)
        return (ox + l * dpr, oy + t * dpr, ox + r * dpr, oy + b * dpr)

    def wait_rect(self, selector: str, text: str | None = None, timeout: float = 20):
        end = time.time() + timeout
        while time.time() < end:
            r = self.rect(selector, text)
            if r:
                return r
            time.sleep(0.25)
        raise TimeoutError(f"element '{selector}' ({text}) not found")

    def text(self, selector: str) -> str:
        return self.js(f"(document.querySelector({json.dumps(selector)})||{{}}).innerText || ''") or ""

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def center(r: tuple[float, float, float, float], fx: float = 0.5, fy: float = 0.5) -> tuple[float, float]:
    return r[0] + (r[2] - r[0]) * fx, r[1] + (r[3] - r[1]) * fy
