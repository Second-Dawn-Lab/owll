// One shared copy of the Quality mode status for every component of a window (the tone picker, the result pane, the Write
// tab, the settings page). Separate copies per component could disagree (one still showing "needs Quality mode" while the
// polished text was on screen); this one is refreshed whenever the backend says something changed, when the window is used
// again, and when a polish result proves the model works.

import { useEffect, useSyncExternalStore } from "react";
import { ipc, type QualityProgress, type QualityStatus } from "../ipc";

let current: QualityStatus | null = null;
const listeners = new Set<() => void>();
let started = false;
let inflight = false;
let again = false;

const emit = () => listeners.forEach((l) => l());

export function setStatus(next: QualityStatus | null) {
  current = next;
  emit();
}

/** Ask the backend again (calls that arrive while one is running are merged into one more). */
export function refreshQuality() {
  if (inflight) {
    again = true;
    return;
  }
  inflight = true;
  void ipc
    .qualityStatus()
    .then(setStatus)
    .catch(() => undefined)
    .finally(() => {
      inflight = false;
      if (again) {
        again = false;
        refreshQuality();
      }
    });
}

/** Put the latest download progress into the status without asking the backend for every update. */
export function mergeProgress(status: QualityStatus, p: QualityProgress): QualityStatus {
  const others = status.progress.filter((x) => x.id !== p.id);
  return { ...status, progress: p.step === "done" || p.step === "cancelled" ? others : [...others, p] };
}

function start() {
  if (started) return;
  started = true;
  void ipc.onQualityChanged(refreshQuality);
  void ipc.onQualityProgress((p) => {
    if (p.step === "done" || p.step === "cancelled") return refreshQuality();
    if (current) setStatus(mergeProgress(current, p));
    else refreshQuality();
  });
  // A polish result is proof that Quality mode works: a status that says otherwise is stale.
  void ipc.onPolishProgress(() => {
    if (current && !current.ready) refreshQuality();
  });
  window.addEventListener("focus", refreshQuality);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshQuality();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

/** The shared status; `active` asks for it to be loaded (it is not asked for while Quality mode is off, except on the settings page). */
export function useQualityStatus(active: boolean, deps: unknown[] = []): QualityStatus | null {
  const status = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    if (active) refreshQuality();
    // The caller lists what changes the answer (the mode, the chosen models).
  }, [active, ...deps]);
  return active ? status : null;
}
