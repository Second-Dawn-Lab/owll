// Does a key press match a stored shortcut such as "Ctrl+Shift+O"? Used by the pages, which handle the
// capture shortcut themselves in addition to the keyboard hook of the backend: inside Owl-L's own windows a
// focused text box (and WebView2's built-in browser shortcuts) must never swallow it.

/** "ctrl+shift+o" as a sorted, lowercase set of parts, or null for a shortcut that is not a single combination. */
export function comboOf(shortcut: string): string[] | null {
  // "Ctrl+C C" (press twice) is not a single combination.
  if (/\s/.test(shortcut.trim())) return null;
  const parts = shortcut
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  return parts.length >= 2 ? [...parts].sort() : null;
}

export function sameCombo(a: string | null, b: string): boolean {
  const x = a ? comboOf(a) : null;
  const y = comboOf(b);
  return !!x && !!y && x.length === y.length && x.every((part, i) => part === y[i]);
}
