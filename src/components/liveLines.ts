// The conversation of a live session: every line with the time it appeared (up to 2,000 in memory), the text of a transcript,
// and what to do with the conversation when the session ends.

import type { LiveLine } from "../ipc";

export interface Caption extends LiveLine {
  id: number;
  /** Unix time in milliseconds when the line appeared. */
  at: number;
}

/** The longest conversation kept for one session. */
export const MAX_LINES = 2000;

let nextId = 1;

/** Add the new lines of an update; `replaceLast` swaps the last line for the first new one (the caption grew, keeping its time). */
export function addLines(list: Caption[], lines: LiveLine[], replaceLast: boolean, now: number = Date.now()): Caption[] {
  if (lines.length === 0) return list;
  const replaced = replaceLast ? list[list.length - 1] : undefined;
  const base = replaceLast ? list.slice(0, -1) : list;
  const added = lines.map((l, i) => ({ ...l, id: i === 0 && replaced ? replaced.id : nextId++, at: i === 0 && replaced ? replaced.at : now }));
  const all = [...base, ...added];
  return all.length > MAX_LINES ? all.slice(all.length - MAX_LINES) : all;
}

/** "14:05:09" in the viewer's clock. */
export function clock(ms: number, locale?: string): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/** "14:05–14:42". */
export function timeRange(from: number, to: number, locale?: string): string {
  const short = (ms: number) => new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${short(from)}–${short(to)}`;
}

/** The conversation as a text file: time, translation, the original in brackets under it. */
export function transcriptText(list: { t?: number; at?: number; original: string; translation: string }[], locale?: string): string {
  return list.map((c) => `[${clock((c.at ?? c.t) ?? 0, locale)}] ${c.translation}\n  (${c.original})`).join("\n\n") + (list.length ? "\n" : "");
}

export type SaveChoice = "ask" | "always" | "never";

/** What happens to the conversation when the session ends: nothing to save, save at once, drop at once, or ask in the bar. */
export function decideSave(choice: string, lineCount: number): "nothing" | "save" | "skip" | "ask" {
  if (lineCount === 0) return "nothing";
  if (choice === "always") return "save";
  if (choice === "never") return "skip";
  return "ask";
}

/** What "Remember my choice" stores for the answer given: only when it is ticked. */
export function choiceToRemember(save: boolean, remember: boolean): SaveChoice | null {
  return remember ? (save ? "always" : "never") : null;
}
