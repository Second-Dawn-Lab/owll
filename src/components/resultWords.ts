// The words of a translation that can be clicked, and what a picked alternative does to the text.

export interface Word {
  text: string;
  /** UTF-16 offsets into the text (what JavaScript and the backend both index by). */
  start: number;
  end: number;
}

export interface SegmentLike {
  source: string;
  input: string;
  target: string;
  start: number;
  end: number;
  pinned: boolean;
}

/** Letters, digits and the apostrophes and hyphens inside words. */
const WORD = /[\p{L}\p{N}\p{M}][\p{L}\p{N}\p{M}'’_-]*/gu;

export function wordsOf(text: string): Word[] {
  return Array.from(text.matchAll(WORD), (m) => ({ text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

/**
 * Put a picked sentence into the text. Returns the new text and the segments with the picked one replaced
 * (and marked as pinned) and every later one moved by the change in length.
 */
export function applyPick<T extends SegmentLike>(text: string, segments: T[], index: number, sentence: string): { text: string; segments: T[] } {
  const seg = segments[index];
  if (!seg) return { text, segments };
  const delta = sentence.length - (seg.end - seg.start);
  const next = segments.map((s, i) => {
    if (i < index) return s;
    if (i === index) return { ...s, target: sentence, end: s.start + sentence.length, pinned: true };
    return { ...s, start: s.start + delta, end: s.end + delta };
  });
  return { text: text.slice(0, seg.start) + sentence + text.slice(seg.end), segments: next };
}
