import type { WritePiece } from "../ipc";

/** The number of changes (the ids run 0..count-1). */
export function changeCount(pieces: WritePiece[]): number {
  return pieces.filter((p) => p.kind === "change").length;
}

/** The text with the accepted changes applied; a change that is not accepted keeps the old words. Mirrors `diff::apply` in dawn-llm. */
export function applyPieces(pieces: WritePiece[], accepted: boolean[]): string {
  return pieces.map((p) => (p.kind === "same" ? p.text : accepted[p.id] ? p.new : p.old)).join("");
}

export function toggled(accepted: boolean[], id: number): boolean[] {
  return accepted.map((v, i) => (i === id ? !v : v));
}

/** How many changes are accepted. */
export function acceptedCount(accepted: boolean[]): number {
  return accepted.filter(Boolean).length;
}
