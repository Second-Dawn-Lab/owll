// The document editor's state, as pure functions: the rows, the user's edits, undo and redo for the whole document, the
// filters and the formatting markers. The window only shows it; everything here is tested without the app.

import type { EditHeader, EditOpened, EditSegment } from "../ipc";

export interface Row {
  /** The unit this row translates, or null for text that is left as it was. */
  unit: number | null;
  header: EditHeader;
  source: string;
  styles: number[];
  plain: boolean;
  /** The engine's translation (what "Retranslate" gives back), null for a row that is left as it was. */
  base: string | null;
  hits: number;
}

/** One step of undo: what a segment was before and after (the edit, and the base, which Retranslate changes). */
interface Change {
  unit: number;
  before: { edit: string | undefined; base: string; hits: number };
  after: { edit: string | undefined; base: string; hits: number };
}

export interface EditState {
  rows: Row[];
  /** Row index of every unit. */
  rowOf: number[];
  /** The user's edits by unit. */
  edits: Record<number, string>;
  past: Change[];
  future: Change[];
}

export function open(opened: EditOpened): EditState {
  const rows: Row[] = [];
  const rowOf: number[] = [];
  const edits: Record<number, string> = {};
  opened.segments.forEach((s: EditSegment) => {
    if (s.unit !== null) {
      rowOf[s.unit] = rows.length;
      if (s.edited && s.translation !== null) edits[s.unit] = s.translation;
    }
    rows.push({ unit: s.unit, header: s.header, source: s.source, styles: s.styles, plain: s.plain, base: s.unit === null ? null : (s.base ?? s.translation), hits: s.hits });
  });
  return { rows, rowOf, edits, past: [], future: [] };
}

/** The translation now: the edit if there is one, else the engine's. */
export function textOf(state: EditState, unit: number): string {
  return state.edits[unit] ?? state.rows[state.rowOf[unit]].base ?? "";
}

export function isEdited(state: EditState, unit: number): boolean {
  return unit in state.edits;
}

export function editedCount(state: EditState): number {
  return Object.keys(state.edits).length;
}

const withRow = (state: EditState, unit: number, change: (row: Row) => Row): Row[] => state.rows.map((r, i) => (i === state.rowOf[unit] ? change(r) : r));

function setEdit(edits: Record<number, string>, unit: number, text: string | undefined): Record<number, string> {
  const next = { ...edits };
  if (text === undefined) delete next[unit];
  else next[unit] = text;
  return next;
}

/** Set a segment's text. Text equal to the engine's translation is "not edited". A new edit ends the redo history. */
export function setText(state: EditState, unit: number, text: string): EditState {
  const row = state.rows[state.rowOf[unit]];
  if (!row || row.base === null || text === textOf(state, unit)) return state;
  const edit = text === row.base ? undefined : text;
  const change: Change = { unit, before: { edit: state.edits[unit], base: row.base, hits: row.hits }, after: { edit, base: row.base, hits: row.hits } };
  return { ...state, edits: setEdit(state.edits, unit, edit), past: [...state.past, change], future: [] };
}

/** Retranslate: the engine's new translation replaces the base and any edit is dropped. */
export function retranslated(state: EditState, unit: number, text: string, hits: number): EditState {
  const row = state.rows[state.rowOf[unit]];
  if (!row || row.base === null) return state;
  const change: Change = { unit, before: { edit: state.edits[unit], base: row.base, hits: row.hits }, after: { edit: undefined, base: text, hits } };
  return { ...state, rows: withRow(state, unit, (r) => ({ ...r, base: text, hits })), edits: setEdit(state.edits, unit, undefined), past: [...state.past, change], future: [] };
}

function apply(state: EditState, change: Change, side: "before" | "after"): EditState {
  const to = change[side];
  return { ...state, rows: withRow(state, change.unit, (r) => ({ ...r, base: to.base, hits: to.hits })), edits: setEdit(state.edits, change.unit, to.edit) };
}

export const canUndo = (state: EditState) => state.past.length > 0;
export const canRedo = (state: EditState) => state.future.length > 0;

/** Undo the last change anywhere in the document. `unit` is the segment it touched, so the window can scroll to it. */
export function undo(state: EditState): { state: EditState; unit: number | null } {
  const change = state.past[state.past.length - 1];
  if (!change) return { state, unit: null };
  const next = apply(state, change, "before");
  return { state: { ...next, past: state.past.slice(0, -1), future: [...state.future, change] }, unit: change.unit };
}

export function redo(state: EditState): { state: EditState; unit: number | null } {
  const change = state.future[state.future.length - 1];
  if (!change) return { state, unit: null };
  const next = apply(state, change, "after");
  return { state: { ...next, future: state.future.slice(0, -1), past: [...state.past, change] }, unit: change.unit };
}

export type Filter = "all" | "edited" | "glossary" | "kept";

/** The row indexes a filter shows. */
export function visibleRows(state: EditState, filter: Filter): number[] {
  const out: number[] = [];
  state.rows.forEach((row, i) => {
    const show =
      filter === "all" ||
      (filter === "edited" && row.unit !== null && isEdited(state, row.unit)) ||
      (filter === "glossary" && row.unit !== null && row.hits > 0) ||
      (filter === "kept" && row.unit === null);
    if (show) out.push(i);
  });
  return out;
}

export function filterCounts(state: EditState): Record<Filter, number> {
  const counts: Record<Filter, number> = { all: state.rows.length, edited: 0, glossary: 0, kept: 0 };
  for (const row of state.rows) {
    if (row.unit === null) counts.kept++;
    else {
      if (isEdited(state, row.unit)) counts.edited++;
      if (row.hits > 0) counts.glossary++;
    }
  }
  return counts;
}

// --- formatting markers ---------------------------------------------------------------------------------------

/** One stretch of a segment with formatting markers: its text and its style bits (1 bold, 2 italic, 4 underline, 8 link). */
export interface Piece {
  text: string;
  style: number;
}

const MARKER = /\{(\/?)(\d+)\}/g;

/** Do the markers `{1}..{/1}{2}..{/2}` come in order, each pair once, with nothing else in braces? */
export function markersIntact(text: string, count: number): boolean {
  // A segment without markers may contain braces of its own.
  if (count <= 1) return true;
  let expect = 1;
  let open = false;
  let last = 0;
  const rest: string[] = [];
  for (const m of text.matchAll(MARKER)) {
    rest.push(text.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const n = Number(m[2]);
    if (m[1] === "") {
      if (open || n !== expect) return false;
      open = true;
    } else {
      if (!open || n !== expect) return false;
      open = false;
      expect++;
    }
  }
  rest.push(text.slice(last));
  return !open && expect === count + 1 && !/[{}]/.test(rest.join(""));
}

/**
 * The stretches of a marked text with their formatting, for showing bold as bold. When the markers are damaged (or the text has none)
 * the whole text is one plain stretch; the markers themselves are never shown.
 */
export function pieces(text: string, styles: number[]): Piece[] {
  if (styles.length <= 1) return [{ text, style: 0 }];
  if (!markersIntact(text, styles.length)) return [{ text: text.replace(MARKER, ""), style: 0 }];
  const out: Piece[] = [];
  let last = 0;
  let current = 0;
  let open = false;
  for (const m of text.matchAll(MARKER)) {
    const between = text.slice(last, m.index);
    if (between) out.push({ text: between, style: open ? styles[current - 1] : 0 });
    last = (m.index ?? 0) + m[0].length;
    open = m[1] === "";
    current = Number(m[2]);
  }
  const tail = text.slice(last);
  if (tail) out.push({ text: tail, style: 0 });
  return out;
}

/** The text without markers. */
export function stripMarkers(text: string): string {
  return text.replace(MARKER, "");
}

/** The edits as the backend wants them (unit to text). */
export function editsForSave(state: EditState): Record<number, string> {
  return state.edits;
}
