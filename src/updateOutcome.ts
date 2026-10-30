// What a finished update check means for the user. Kept apart from updater.ts so it can be tested
// without Tauri.

export interface FoundUpdate {
  version: string;
  body?: string | null;
}

export type CheckOutcome =
  | { kind: "available"; version: string; body: string }
  | { kind: "uptodate" }
  /** The server could not be reached (no connection, DNS, timeout, proxy ...). */
  | { kind: "offline" }
  /** The server answered, but there is no release or no usable latest.json (yet). */
  | { kind: "norelease" };

/** The updater plugin turns a missing `latest.json` (any HTTP error status) into this message. */
const NO_RELEASE = /valid release json|release json|\b404\b|not found|expected value|missing field|eof while parsing|unexpected end|invalid type|trailing characters/i;
const NETWORK = /error sending request|dns|lookup|connect|timed? ?out|network|tcp|offline|unreachable|os error|proxy|certificate|tls|ssl/i;

/** Tell "I can't reach the server" apart from "the server has nothing for me". */
export function classifyCheckError(message: string): "offline" | "norelease" {
  if (NETWORK.test(message)) return "offline";
  if (NO_RELEASE.test(message)) return "norelease";
  return "offline";
}

/** The result of `check()` (an update, or null when up to date) or the error it threw. */
export function outcomeOf(result: { update: FoundUpdate | null } | { error: unknown }): CheckOutcome {
  if ("error" in result) return { kind: classifyCheckError(String(result.error)) };
  const update = result.update;
  return update ? { kind: "available", version: update.version, body: update.body ?? "" } : { kind: "uptodate" };
}
