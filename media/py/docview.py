"""Two document pages side by side, labelled "Original" and "Translated by Owl-L" (a helper window for the documents scene).
usage: docview.py <left.png> <right.png> <x> <y> <width> <height>"""
import sys
import tkinter as tk
import tkinter.font as tkfont

from PIL import Image, ImageTk

left, right = sys.argv[1], sys.argv[2]
x, y, w, h = (int(v) for v in sys.argv[3:7])
root = tk.Tk()
root.title("Documents")
root.geometry(f"{w}x{h}+{x}+{y}")
root.configure(bg="#eceef4")
root.resizable(False, False)
f = tkfont.Font(family="Segoe UI", size=16, weight="bold")
imgs = []
for i, (path, label) in enumerate(((left, "Original (German)"), (right, "Translated by Owl-L (English)"))):
    im = Image.open(path).convert("RGB")
    scale = min((w // 2 - 60) / im.width, (h - 110) / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    ph = ImageTk.PhotoImage(im)
    imgs.append(ph)
    col = tk.Frame(root, bg="#eceef4")
    col.place(relx=0.25 + 0.5 * i, rely=0.5, anchor="center")
    tk.Label(col, text=label, font=f, bg="#eceef4", fg="#23252e").pack(pady=(0, 12))
    tk.Label(col, image=ph, borderwidth=1, relief="solid").pack()
root.update()
print("ready", flush=True)
root.mainloop()
