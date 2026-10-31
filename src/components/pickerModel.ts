// The list that opens in a window of its own (see src-tauri/src/picker.rs): what a row is, how the search narrows the rows,
// and which row the keyboard is on. Pure, so it is tested without a window.

export interface PickerRow {
  kind: "item" | "group";
  /** What is sent back when the row is chosen (items only). */
  value?: string;
  label: string;
  checked?: boolean;
  /** A small tag after the name ("Beta"). */
  tag?: string;
  /** A small badge at the end ("Download"). */
  badge?: string;
}

export interface PickerSpec {
  /** Echoed in the answer, so the asking page knows which of its lists was answered. */
  id: string;
  anchor: { x: number; y: number; width: number; height: number };
  items: PickerRow[];
  /** Show a search field above the list. */
  search?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}

/** The rows that match the search; a group heading stays only while some item under it does. */
export function filterRows(rows: PickerRow[], query: string): PickerRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const out: PickerRow[] = [];
  let heading: PickerRow | null = null;
  for (const row of rows) {
    if (row.kind === "group") {
      heading = row;
      continue;
    }
    if (row.label.toLowerCase().includes(q) || (row.value ?? "").toLowerCase().includes(q)) {
      if (heading) {
        out.push(heading);
        heading = null;
      }
      out.push(row);
    }
  }
  return out;
}

/** The chosen row's index among the items only (arrow keys skip headings). Clamped to the items. */
export function moveCursor(rows: PickerRow[], current: number, step: 1 | -1): number {
  const items = rows.map((r, i) => (r.kind === "item" ? i : -1)).filter((i) => i >= 0);
  if (items.length === 0) return -1;
  const at = items.indexOf(current);
  if (at < 0) return step === 1 ? items[0] : items[items.length - 1];
  return items[Math.max(0, Math.min(items.length - 1, at + step))];
}

/** The row the list starts on: the checked one, else the first item. */
export function startCursor(rows: PickerRow[]): number {
  const checked = rows.findIndex((r) => r.kind === "item" && r.checked);
  return checked >= 0 ? checked : rows.findIndex((r) => r.kind === "item");
}
