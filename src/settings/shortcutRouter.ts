// One in-page mechanism for every Owl-L shortcut (quick access, capture, live captions, ...). The keyboard hook of the
// backend sees keys in other programs; inside Owl-L's own windows a focused text box or WebView2's built-in browser
// shortcuts could swallow them, so the page matches them too and reports them to the backend, which runs each key
// press once (`shortcut_fired`). Single presses ("Ctrl+Shift+L") and double presses ("Ctrl+L L") are handled alike.

export type ShortcutName = "translate" | "capture" | "live";

export interface Binding {
  name: ShortcutName;
  shortcut: string;
  enabled: boolean;
}

/** The parts of a keyboard event the router reads. */
export interface KeyLike {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  /** AltGr (Ctrl+Alt on many keyboard layouts) types characters; it is never a shortcut. */
  altGraph?: boolean;
}

export interface Parsed {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
  key: string;
  double: boolean;
}

/** "Ctrl+Shift+O" or "Ctrl+L L". Null for anything else. */
export function parseShortcut(text: string): Parsed | null {
  const [combo, again, ...rest] = text.trim().split(/\s+/);
  if (!combo || rest.length > 0) return null;
  const parts = combo.split("+").map((p) => p.trim());
  const key = parts.pop()?.toUpperCase();
  if (!key || parts.length === 0) return null;
  if (again !== undefined && again.toUpperCase() !== key) return null;
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const known = ["ctrl", "alt", "shift", "win"];
  if ([...mods].some((m) => !known.includes(m))) return null;
  return { ctrl: mods.has("ctrl"), alt: mods.has("alt"), shift: mods.has("shift"), win: mods.has("win"), key, double: again !== undefined };
}

/** The key of an event as a shortcut names it (a letter, digit, F1-F12 or Space), else null. */
export function eventKey(code: string): string | null {
  const m = /^Key([A-Z])$/.exec(code) ?? /^Digit([0-9])$/.exec(code) ?? /^(F(?:[1-9]|1[0-2]))$/.exec(code);
  if (m) return m[1];
  return code === "Space" ? "SPACE" : null;
}

const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)$/;

/** Everyday editing keys: a single press of these with Ctrl in a text box is editing, not a shortcut. */
const EDITING_KEYS = new Set(["C", "V", "X", "A", "Z", "Y"]);

function modifiersMatch(p: Parsed, e: KeyLike): boolean {
  return p.ctrl === e.ctrlKey && p.alt === e.altKey && p.shift === e.shiftKey && p.win === e.metaKey;
}

export interface Fire {
  name: ShortcutName;
  /** The key press belongs to the shortcut: the page stops the web view from using it. */
  consume: boolean;
}

export class ShortcutRouter {
  private parsed: { name: ShortcutName; p: Parsed }[] = [];
  /** Per shortcut: the time of the first press of a double shortcut. */
  private first = new Map<ShortcutName, number>();

  constructor(
    bindings: Binding[],
    private windowMs = 400,
  ) {
    this.parsed = bindings.flatMap((b) => {
      const p = b.enabled ? parseShortcut(b.shortcut) : null;
      return p ? [{ name: b.name, p }] : [];
    });
  }

  /** Feed one key-down. `editable`: the focus is in a text box. Returns the shortcut that fired, if any. */
  onKeyDown(e: KeyLike, now: number, editable: boolean): Fire | null {
    if (MODIFIER_CODES.test(e.code) || e.altGraph) return null;
    if (e.repeat) return null; // auto-repeat is neither a press nor an interruption
    const key = eventKey(e.code);
    let result: Fire | null = null;
    for (const { name, p } of this.parsed) {
      if (key !== p.key || !modifiersMatch(p, e)) {
        this.first.delete(name); // another key (or the wrong modifiers) in between starts over
        continue;
      }
      if (!p.double) {
        // Shift alone types a capital letter and Ctrl+V and friends edit: those stay with the text box.
        if (editable && ((!p.ctrl && !p.alt && !p.win) || (p.ctrl && !p.alt && !p.shift && !p.win && EDITING_KEYS.has(p.key)))) continue;
        result ??= { name, consume: true };
        continue;
      }
      const at = this.first.get(name);
      if (at !== undefined && now - at <= this.windowMs) {
        this.first.delete(name);
        result ??= { name, consume: true };
      } else {
        // The first press passes through: Ctrl+C C must still copy the first time.
        this.first.set(name, now);
      }
    }
    return result;
  }
}

/** Is the focus in a place where typed keys edit text? */
export function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes((el as HTMLInputElement).type);
}
