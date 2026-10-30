// How big the alternatives list is: as many rows as there are (a row is one line), at most eight without
// scrolling, and never taller than the window.

export const ALT_ROW_HEIGHT = 32;
export const ALT_MAX_ROWS = 8;

export interface AltsSize {
  /** Rows that fit without scrolling. */
  rows: number;
  /** Height of the list in pixels. */
  height: number;
  /** The list scrolls (there are more items than rows). */
  scrolls: boolean;
}

/**
 * `count` items, `available` pixels of height for the list (what is left in the window).
 * The list shows up to `maxRows` rows; a short window gives fewer rows (but at least two) and scrolls.
 */
export function altsSize(count: number, available: number, rowHeight = ALT_ROW_HEIGHT, maxRows = ALT_MAX_ROWS): AltsSize {
  const fit = Math.max(2, Math.floor(available / rowHeight));
  const rows = Math.max(1, Math.min(count, maxRows, fit));
  return { rows, height: rows * rowHeight, scrolls: count > rows };
}

/** What follows the word in a preview ("erstaunt. ..." -> "."): shown muted after the bold word, "..." when only punctuation is left. */
export function previewRest(word: string, preview: string): string {
  const p = preview.trim();
  const rest = p.toLowerCase().startsWith(word.toLowerCase()) ? p.slice(word.length).trim() : p;
  return /[\p{L}\p{N}]/u.test(rest) ? rest : "\u2026";
}
