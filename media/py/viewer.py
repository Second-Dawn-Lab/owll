"""A bare image viewer window (no browser shortcuts that could grab the capture hotkey): python viewer.py <image> <x> <y> <width>
Prints "<left> <top> <right> <bottom>" (screen pixels of the picture) when it is up."""
import sys
import tkinter as tk

from PIL import Image, ImageTk

path, x, y, width = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
root = tk.Tk()
root.title("Notice")
im = Image.open(path).convert("RGB")
im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
photo = ImageTk.PhotoImage(im)
lab = tk.Label(root, image=photo, borderwidth=0, highlightthickness=0)
lab.pack()
root.geometry(f"+{x}+{y}")
root.resizable(False, False)
root.update()
print(lab.winfo_rootx(), lab.winfo_rooty(), lab.winfo_rootx() + width, lab.winfo_rooty() + im.height, flush=True)
root.mainloop()
