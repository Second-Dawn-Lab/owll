import { describe, expect, it } from "vitest";
import { filterRows, moveCursor, startCursor, type PickerRow } from "./pickerModel";

const rows: PickerRow[] = [
  { kind: "item", value: "auto", label: "Detect language" },
  { kind: "group", label: "Installed" },
  { kind: "item", value: "en", label: "English", checked: true },
  { kind: "item", value: "de", label: "German" },
  { kind: "group", label: "Download" },
  { kind: "item", value: "fr", label: "French", badge: "Download" },
];

describe("the list that opens in its own window", () => {
  it("shows everything without a search and narrows by name or code, keeping only headings that still have items", () => {
    expect(filterRows(rows, "")).toHaveLength(6);
    expect(filterRows(rows, "ger").map((r) => r.label)).toEqual(["Installed", "German"]);
    expect(filterRows(rows, "fr").map((r) => r.label)).toEqual(["Download", "French"]);
    expect(filterRows(rows, "DE").map((r) => r.label)).toEqual(["Detect language", "Installed", "German"]);
    expect(filterRows(rows, "zzz")).toEqual([]);
  });

  it("starts on the checked row, else the first item", () => {
    expect(startCursor(rows)).toBe(2);
    expect(startCursor(rows.map((r) => ({ ...r, checked: false })))).toBe(0);
    expect(startCursor([{ kind: "group", label: "x" }])).toBe(-1);
  });

  it("moves with the arrow keys over items only and stops at the ends", () => {
    expect(moveCursor(rows, 0, 1)).toBe(2);
    expect(moveCursor(rows, 3, 1)).toBe(5);
    expect(moveCursor(rows, 5, 1)).toBe(5);
    expect(moveCursor(rows, 0, -1)).toBe(0);
    expect(moveCursor(rows, 2, -1)).toBe(0);
    expect(moveCursor(rows, -1, 1)).toBe(0);
    expect(moveCursor([], 0, 1)).toBe(-1);
  });
});
