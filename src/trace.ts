import { ipc } from "./ipc";

/** Timing breadcrumbs for performance work. The backend ignores them unless DAWN_TRACE is set. */
export function trace(msg: string): void {
  void ipc.trace(msg);
}
