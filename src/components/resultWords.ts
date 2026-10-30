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

export interface TermLike {
  start: number;
  end: number;
}

/** The glossary term a word belongs to (the word overlaps the term's position), if any. */
export function termAt<H extends TermLike>(terms: H[], word: { start: number; end: number }): H | undefined {
  return terms.find((t) => word.start < t.end && word.end > t.start);
}

/**
 * Put a picked sentence into the text. Returns the new text, the segments with the picked one replaced (and
 * marked as pinned) and every later one moved by the change in length, and the glossary terms: those inside the
 * replaced sentence are dropped (a picked sentence is not glossary-made), later ones move with the text.
 */
export function applyPick<T extends SegmentLike, H extends TermLike = TermLike>(text: string, segments: T[], index: number, sentence: string, terms: H[] = []): { text: string; segments: T[]; terms: H[] } {
  const seg = segments[index];
  if (!seg) return { text, segments, terms };
  const delta = sentence.length - (seg.end - seg.start);
  const next = segments.map((s, i) => {
    if (i < index) return s;
    if (i === index) return { ...s, target: sentence, end: s.start + sentence.length, pinned: true };
    return { ...s, start: s.start + delta, end: s.end + delta };
  });
  const movedTerms = terms.filter((t) => t.end <= seg.start || t.start >= seg.end).map((t) => (t.start >= seg.end ? { ...t, start: t.start + delta, end: t.end + delta } : t));
  return { text: text.slice(0, seg.start) + sentence + text.slice(seg.end), segments: next, terms: movedTerms };
}
