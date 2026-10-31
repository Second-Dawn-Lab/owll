// Ask for a list window (see PickerPage) and wait for the answer.

import { ipc } from "../ipc";
import type { PickerRow, PickerSpec } from "./pickerModel";

let counter = 0;

/** Windows that are too small for their own drop-downs (the caption bar, the quick popup) open lists in a window of their own. */
export function opensListsInOwnWindow(label: string): boolean {
  return label === "live" || label === "quick";
}

/**
 * Open a list next to `anchor` (the control that was clicked) and resolve with the value of the row that was chosen, or null when
 * the list was closed (Esc, a click elsewhere, the same control again).
 */
export async function pickFromList(anchor: DOMRect, items: PickerRow[], options: { search?: boolean; searchPlaceholder?: string; emptyText?: string } = {}): Promise<string | null> {
  const id = `list-${++counter}`;
  const done = new Promise<string | null>((resolve) => {
    const offs: Promise<() => void>[] = [];
    const finish = (value: string | null) => {
      offs.forEach((off) => void off.then((fn) => fn()));
      resolve(value);
    };
    offs.push(ipc.onPickerChoice((e) => e.id === id && finish(e.value)));
    offs.push(ipc.onPickerClosed((e) => e.id === id && finish(null)));
  });
  const spec: PickerSpec = { id, anchor: { x: anchor.left, y: anchor.top, width: anchor.width, height: anchor.height }, items, ...options };
  await ipc.pickerOpen(spec);
  return done;
}
