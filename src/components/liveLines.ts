// The caption bar's lines: the history kept in memory (about 50 lines), the latest few shown, the transcript text.

import type { LiveLine } from "../ipc";

export interface Caption extends LiveLine {
  id: number;
}

/** How many lines the bar remembers. */
export const HISTORY_LINES = 50;

let nextId = 1;

/** Add the new lines of an update; `replaceLast` swaps the last line for the first new one (the caption grew). */
export function addLines(list: Caption[], lines: LiveLine[], replaceLast: boolean): Caption[] {
  if (lines.length === 0) return list;
  const base = replaceLast ? list.slice(0, -1) : list;
  const added = lines.map((l) => ({ ...l, id: nextId++ }));
  return [...base, ...added].slice(-HISTORY_LINES);
}

/** The latest `count` lines (1 to 3), oldest first. */
export function shownLines(list: Caption[], count: number): Caption[] {
  return list.slice(-Math.max(1, Math.min(3, count)));
}

/** The transcript as a text file: the translation of each line, the original under it. */
export function transcriptText(list: Caption[]): string {
  return list.map((c) => `${c.translation}\n  (${c.original})`).join("\n\n") + (list.length ? "\n" : "");
}
