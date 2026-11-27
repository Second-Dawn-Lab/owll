// The conversation of a live session: every line with the time it appeared (up to 2,000 in memory), the text of a transcript,
// and what to do with the conversation when the session ends.

import type { LiveUtterance } from "../ipc";

export interface Caption {
  original: string;
  translation: string;
  id: number;
  /** Unix time in milliseconds when the line appeared. */
  at: number;
  /** The speaker of a meeting caption (a label, never translated) and the backend's id of the caption. */
  speaker?: string | null;
  utterance?: number;
  /** Still being spoken: the translation grows. */
  growing?: boolean;
  polished?: boolean;
}

/** The longest conversation kept for one session. */
export const MAX_LINES = 2000;

let nextId = 1;

/** Ids of one kind of caption (meeting or plain) grow in the order spoken; the two kinds are counted apart. */
const kind = (id: number) => Math.floor(id / 2 ** 32);

/**
 * A caption (an utterance of a meeting, or a sentence of plain subtitles): a new line the first time, the same line (keeping
 * its time and place) while it grows, when it ends, when it is corrected and when its polished translation arrives. A new line
 * goes where it was spoken: above any line of a later caption, else at the end.
 */
export function upsertUtterance(list: Caption[], u: LiveUtterance, now: number = Date.now()): Caption[] {
  const line: Omit<Caption, "id" | "at"> = { original: u.original, translation: u.translation, speaker: u.speaker, utterance: u.id, growing: !u.finished, polished: u.polished };
  const at = list.findIndex((c) => c.utterance === u.id);
  if (at >= 0) {
    const next = list.slice();
    next[at] = { ...next[at], ...line };
    return next;
  }
  const later = list.findIndex((c) => c.utterance !== undefined && kind(c.utterance) === kind(u.id) && c.utterance > u.id);
  const all = list.slice();
  all.splice(later < 0 ? all.length : later, 0, { ...line, id: nextId++, at: later < 0 ? now : list[later].at });
  return all.length > MAX_LINES ? all.slice(all.length - MAX_LINES) : all;
}

/** "Anna Keller: " in front of a line of a meeting, nothing otherwise. */
export function speakerPrefix(speaker?: string | null): string {
  return speaker ? `${speaker}: ` : "";
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
  return list.map((c) => `[${clock((c.at ?? c.t) ?? 0, locale)}] ${speakerPrefix((c as { speaker?: string | null }).speaker)}${c.translation}\n  (${c.original})`).join("\n\n") + (list.length ? "\n" : "");
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
