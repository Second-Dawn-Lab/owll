"""A plain reading window with selectable German text (the made-up article), used for the quick-popup scene.
usage: article.py <x> <y> <width> <height>.  Prints "<left> <top> <right> <bottom>" of the first paragraph (screen pixels)."""
import sys
import tkinter as tk
import tkinter.font as tkfont

x, y, w, h = (int(v) for v in sys.argv[1:5])
PARAS = [
    "Die Stadtbibliothek öffnet am Samstag nach dem Umbau wieder ihre Türen. Der Eintritt ist für alle frei.",
    "Es gibt neue Leseecken, einen Raum für Kinder und ein kleines Café im Erdgeschoss.",
]
root = tk.Tk()
root.title("Neues aus der Stadt")
root.geometry(f"{w}x{h}+{x}+{y}")
root.configure(bg="#f4f4f6")
title = tk.Label(root, text="Neues aus der Stadt", font=tkfont.Font(family="Segoe UI", size=26, weight="bold"), bg="#f4f4f6", fg="#222", anchor="w")
title.pack(fill="x", padx=120, pady=(60, 0))
meta = tk.Label(root, text="Lokales · Kultur", font=tkfont.Font(family="Segoe UI", size=12), bg="#f4f4f6", fg="#888", anchor="w")
meta.pack(fill="x", padx=120, pady=(0, 20))
text = tk.Text(root, wrap="word", font=tkfont.Font(family="Segoe UI", size=18), bg="#f4f4f6", fg="#222", relief="flat", borderwidth=0,
               highlightthickness=0, padx=0, pady=0, spacing1=0, spacing2=8, spacing3=18, cursor="arrow", selectbackground="#b7c6f5", selectforeground="#111")
text.pack(fill="both", expand=True, padx=120)
text.insert("1.0", PARAS[0] + "\n" + PARAS[1])
text.configure(state="disabled")
root.update()
first = text.bbox("1.0")
last = text.bbox("1.end - 1 chars")
rx, ry = text.winfo_rootx(), text.winfo_rooty()
print(rx + first[0], ry + first[1], rx + text.winfo_width(), ry + last[1] + last[3], flush=True)
root.mainloop()
