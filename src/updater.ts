// Update checks. Together with language pack downloads this is the only network access in Owl-L:
// `check()` asks `latest.json` on the latest GitHub release (see docs/releasing.md). It is a plain
// download of that file: no text, files, history or account data are sent.
import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./ipc";
import { outcomeOf } from "./updateOutcome";

export interface UpdateInfo {
  version: string;
  /** Release notes, first lines only. */
  notes: string;
}

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  /** The server could not be reached. */
  | { kind: "offline" }
  /** The server answered but has no release or no latest.json. */
  | { kind: "norelease" }
  /** Downloading or installing the update failed. */
  | { kind: "failed"; message: string }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "installing" };

type Pending = { downloadAndInstall: () => Promise<void> };

let state: UpdateState = { kind: "idle" };
let pending: Pending | null = null;
const listeners = new Set<() => void>();

function set(next: UpdateState) {
  state = next;
  listeners.forEach((l) => l());
}

function shortNotes(body: string | undefined): string {
  const lines = (body ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const text = lines.slice(0, 4).join("\n");
  return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}

/** Ask for a newer version. `quiet` checks (at startup) never show "up to date" or errors. */
export async function checkForUpdate(quiet: boolean): Promise<void> {
  if (state.kind === "checking" || state.kind === "installing") return;
  if (!isTauri) {
    if (!quiet) set({ kind: "uptodate" });
    return;
  }
  if (!quiet) set({ kind: "checking" });
  let outcome;
  let update: (Pending & { version: string; body?: string }) | null = null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    update = await check();
    outcome = outcomeOf({ update });
    void invoke("update_check_done");
  } catch (error) {
    outcome = outcomeOf({ error });
  }
  switch (outcome.kind) {
    case "available":
      pending = update;
      set({ kind: "available", info: { version: outcome.version, notes: shortNotes(outcome.body) } });
      break;
    case "uptodate":
      if (!quiet) set({ kind: "uptodate" });
      break;
    default:
      // Offline, or no release yet: say so only when the user asked.
      if (!quiet) set({ kind: outcome.kind });
  }
}

/** Download, install and restart into the new version. */
export async function installUpdate(): Promise<void> {
  if (!pending || state.kind !== "available") return;
  set({ kind: "installing" });
  try {
    await pending.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    set({ kind: "failed", message: String(err) });
    pending = null;
  }
}

/** Hide the notice ("Later"); the next quiet check offers it again. */
export function dismissUpdate() {
  if (state.kind !== "installing") set({ kind: "idle" });
}

/** The quiet check at startup: only when the backend says a day has passed since the last one. */
export async function quietCheckAtStartup(): Promise<void> {
  if (!isTauri || import.meta.env.DEV) return;
  try {
    if (await invoke<boolean>("update_check_due")) await checkForUpdate(true);
  } catch {
    // Never bother the user with a failed background check.
  }
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
