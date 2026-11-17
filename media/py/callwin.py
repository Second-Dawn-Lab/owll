"""A made-up, generic video-call window for the meeting-captions scene (tkinter). Not an imitation of any real product: its own layout,
its own colours, no logos. Four participant tiles with initials avatars, a control bar, and a caption area at the bottom with the layout
that meeting mode reads: an avatar with initials, the speaker's name, then text that grows word by word while that person "speaks".

usage: callwin.py <x> <y> <flag-file>
Prints "<left> <top> <right> <bottom>" (screen pixels) of the caption area when the window is up; the captions start when <flag-file> exists."""
import os
import random
import sys
import time
import tkinter as tk
import tkinter.font as tkfont

X, Y, FLAG = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
W, H = 1120, 760
BG, TILE, INK, MUTED, ACCENT = "#171b26", "#232a3b", "#f3f5fa", "#9aa3b8", "#ff7a59"
CAP_BG = "#0e1119"
PEOPLE = {
    "Lena Hoffmann": ("LH", "#7a5cff"),
    "Tom Becker": ("TB", "#1fa6a0"),
    "Sara Klein": ("SK", "#d9588a"),
    "You": ("YO", "#4d86d8"),
}
# A short, natural, made-up work conversation (German): (speaker, text)
TURNS = [
    ("Lena Hoffmann", "Guten Morgen zusammen. Ich möchte kurz den Stand des Projekts zusammenfassen."),
    ("Tom Becker", "Vielen Dank, Lena. Die Tests laufen gut, aber wir brauchen noch einen Tag für die Dokumentation."),
    ("Sara Klein", "Das ist in Ordnung. Ich schicke euch bis Freitag den Zeitplan für die nächste Woche."),
    ("Lena Hoffmann", "Perfekt, dann sind wir alle auf dem gleichen Stand."),
]
WORD_GAP = (0.26, 0.36)   # seconds between words (about 3 words a second)
TURN_GAP = 1.5

root = tk.Tk()
root.title("Team call")
root.geometry(f"{W}x{H}+{X}+{Y}")
root.configure(bg=BG)
root.resizable(False, False)
cv = tk.Canvas(root, width=W, height=H, bg=BG, highlightthickness=0)
cv.pack()
f_title = tkfont.Font(family="Segoe UI", size=14, weight="bold")
f_small = tkfont.Font(family="Segoe UI", size=11)
f_name = tkfont.Font(family="Segoe UI", size=12, weight="bold")
f_init = tkfont.Font(family="Segoe UI", size=26, weight="bold")
f_cap_name = tkfont.Font(family="Segoe UI", size=16, weight="bold")
f_cap = tkfont.Font(family="Segoe UI", size=21)
f_cap_init = tkfont.Font(family="Segoe UI", size=13, weight="bold")

# --- top bar (title, timer, controls) ------------------------------------------------------------------------------------------------
cv.create_text(28, 36, text="Weekly sync", fill=INK, font=f_title, anchor="w")
cv.create_text(190, 36, text="12:41", fill=MUTED, font=f_small, anchor="w")
x = W - 28
for label, color, w in (("Leave", "#c8433a", 80), ("Captions on", "#2c3550", 120), ("Share", "#2c3550", 80), ("Camera", "#2c3550", 90), ("Mute", "#2c3550", 80)):
    cv.create_rectangle(x - w, 20, x, 52, fill=color, outline=color)
    cv.create_text(x - w / 2, 36, text=label, fill="white" if label == "Leave" else INK, font=f_small)
    x -= w + 10

# --- tiles -------------------------------------------------------------------------------------------------------------------------
TW, TH, GAP = 520, 236, 16
tiles = {}
for i, name in enumerate(PEOPLE):
    col, row = i % 2, i // 2
    x0, y0 = 28 + col * (TW + GAP), 70 + row * (TH + GAP)
    rect = cv.create_rectangle(x0, y0, x0 + TW, y0 + TH, fill=TILE, outline=TILE, width=4)
    ini, color = PEOPLE[name]
    cx, cy = x0 + TW // 2, y0 + TH // 2 - 14
    cv.create_oval(cx - 46, cy - 46, cx + 46, cy + 46, fill=color, outline=color)
    cv.create_text(cx, cy, text=ini, fill="white", font=f_init)
    cv.create_text(x0 + 14, y0 + TH - 16, text=name, fill=INK, font=f_name, anchor="w")
    tiles[name] = rect

# --- caption area (what the user selects) -----------------------------------------------------------------------------------------
CAP_X0, CAP_Y0, CAP_X1, CAP_Y1 = 28, 598, W - 28, 748
cv.create_rectangle(CAP_X0, CAP_Y0, CAP_X1, CAP_Y1, fill=CAP_BG, outline=CAP_BG)
caption_items = []


def wrap(text: str, width: int) -> list[str]:
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if f_cap.measure(t) <= width or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_captions(blocks: list[tuple[str, str]]) -> None:
    """blocks: (speaker, text). Bottom-aligned; older blocks scroll out of the top of the caption area."""
    for it in caption_items:
        cv.delete(it)
    caption_items.clear()
    text_w = CAP_X1 - CAP_X0 - 96
    y = CAP_Y1 - 10
    for speaker, text in reversed(blocks):
        lines = wrap(text, text_w) or [""]
        block_h = 26 + len(lines) * 30 + 10
        if y - block_h < CAP_Y0 - 4:
            break
        top = y - block_h
        ini, color = PEOPLE[speaker]
        cx, cy = CAP_X0 + 32, top + 36
        caption_items.append(cv.create_oval(cx - 20, cy - 20, cx + 20, cy + 20, fill=color, outline=color))
        caption_items.append(cv.create_text(cx, cy, text=ini, fill="white", font=f_cap_init))
        caption_items.append(cv.create_text(CAP_X0 + 72, top + 14, text=speaker, fill="#ffb199", font=f_cap_name, anchor="w"))
        for i, ln in enumerate(lines):
            caption_items.append(cv.create_text(CAP_X0 + 72, top + 40 + i * 30, text=ln, fill="white", font=f_cap, anchor="w"))
        y = top - 4


def highlight(name: str | None) -> None:
    for n, r in tiles.items():
        cv.itemconfigure(r, outline=ACCENT if n == name else TILE)


state = {"turn": -1, "word": 0, "next": None, "blocks": [], "started": False}


def tick():
    if not state["started"]:
        if os.path.exists(FLAG):
            state["started"] = True
            state["next"] = time.time() + 0.4
        root.after(80, tick)
        return
    now = time.time()
    if now < state["next"]:
        root.after(30, tick)
        return
    if state["turn"] >= len(TURNS):
        root.after(200, tick)
        return
    if state["turn"] == -1 or state["word"] >= len(TURNS[state["turn"]][1].split()):
        state["turn"] += 1
        state["word"] = 0
        if state["turn"] >= len(TURNS):
            highlight(None)
            root.after(200, tick)
            return
        speaker = TURNS[state["turn"]][0]
        highlight(speaker)
        state["blocks"].append((speaker, ""))
        state["next"] = now + (TURN_GAP if state["turn"] else 0.2)
        root.after(30, tick)
        return
    speaker, text = TURNS[state["turn"]]
    words = text.split()
    # a caption starts with a short phrase (one word alone is read badly), then grows word by word
    state["word"] = min(len(words), 3 if state["word"] == 0 else state["word"] + 1)
    state["blocks"][-1] = (speaker, " ".join(words[: state["word"]]))
    draw_captions(state["blocks"][-3:])
    state["next"] = now + random.uniform(*WORD_GAP)
    root.after(30, tick)


root.update()
rx, ry = cv.winfo_rootx(), cv.winfo_rooty()
print(rx + CAP_X0, ry + CAP_Y0, rx + CAP_X1, ry + CAP_Y1, flush=True)
tick()
root.mainloop()
