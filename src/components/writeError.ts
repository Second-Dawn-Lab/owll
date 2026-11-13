// Why a rewrite was not used, in words. The model answers the same way to the same text, so "Try again" would not help; what
// can help is another action, or a change to the text.

export type WriteErrorKey =
  | "write.err.tooLong"
  | "write.err.tooShort"
  | "write.err.wrongLanguage"
  | "write.err.empty"
  | "write.err.degenerate"
  | "write.err.changedMeaning"
  | "write.err.unavailable"
  | "write.error";

/** The message for an error code of `quality_write`; `retryHelps` is false for every answer the checks rejected. */
export function writeErrorKey(code: string): { key: WriteErrorKey; retryHelps: boolean } {
  switch (code) {
    case "quality_rejected_too_long":
      return { key: "write.err.tooLong", retryHelps: false };
    case "quality_rejected_too_short":
      return { key: "write.err.tooShort", retryHelps: false };
    case "quality_rejected_wrong_language":
      return { key: "write.err.wrongLanguage", retryHelps: false };
    case "quality_rejected_empty":
      return { key: "write.err.empty", retryHelps: false };
    case "quality_rejected_degenerate":
      return { key: "write.err.degenerate", retryHelps: false };
    case "quality_rejected_changed_meaning":
      return { key: "write.err.changedMeaning", retryHelps: false };
    case "quality_unavailable":
    case "quality_low_memory":
    case "quality_server":
      // The model could not run: trying again after closing programs, or once it is loaded, can help.
      return { key: "write.err.unavailable", retryHelps: true };
    default:
      return { key: "write.error", retryHelps: true };
  }
}

/** The action whose button stays marked: the running one, else the last one for the text that is in the box. */
export function activeKind<K extends string>(busy: K | null, last: { kind: K; source: string } | null, text: string): K | null {
  if (busy) return busy;
  return last && last.source === text ? last.kind : null;
}
