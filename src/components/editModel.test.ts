import { describe, expect, it } from "vitest";
import type { EditOpened, EditSegment } from "../ipc";
import { canRedo, canUndo, editedCount, filterCounts, markersIntact, open, pieces, redo, retranslated, setText, stripMarkers, textOf, undo, visibleRows } from "./editModel";
import { offsetOf, rowRange } from "./virtualRows";

const seg = (unit: number | null, source: string, translation: string | null, extra: Partial<EditSegment> = {}): EditSegment => ({
  unit,
  header: { part: "body", name: null, number: 1, cell: null },
  source,
  styles: [],
  plain: true,
  translation,
  base: null,
  hits: 0,
  edited: false,
  ...extra,
});

const doc = (segments: EditSegment[]): EditOpened => ({ path: "a.docx", name: "a.docx", kind: "docx", from: "en", to: "de", segments, units: segments.filter((s) => s.unit !== null).length, skipped: [], resumed: false });

const sample = () => open(doc([seg(0, "Hello", "Hallo"), seg(null, "2024", null), seg(1, "Goodbye", "Tschüss", { hits: 1 }), seg(2, "Thanks", "Danke")]));

describe("the editor's rows and edits", () => {
  it("lists every segment, with units for the translatable ones", () => {
    const s = sample();
    expect(s.rows.map((r) => r.unit)).toEqual([0, null, 1, 2]);
    expect(textOf(s, 1)).toBe("Tschüss");
    expect(editedCount(s)).toBe(0);
  });

  it("an edit changes the text and marks the segment; the same text as the engine's is no edit", () => {
    let s = setText(sample(), 0, "Guten Tag");
    expect(textOf(s, 0)).toBe("Guten Tag");
    expect(editedCount(s)).toBe(1);
    s = setText(s, 0, "Hallo");
    expect(editedCount(s)).toBe(0);
  });

  it("segments that are left as they were cannot be edited", () => {
    // Row 1 has no unit: nothing in the model can address it.
    const s = sample();
    expect(s.rows[1].base).toBeNull();
  });

  it("undo and redo work across the whole document, in order", () => {
    let s = setText(sample(), 0, "Guten Tag");
    s = setText(s, 2, "Danke schön");
    expect(canUndo(s)).toBe(true);
    let r = undo(s);
    expect(r.unit).toBe(2);
    expect(textOf(r.state, 2)).toBe("Danke");
    expect(textOf(r.state, 0)).toBe("Guten Tag");
    expect(canRedo(r.state)).toBe(true);
    r = undo(r.state);
    expect(editedCount(r.state)).toBe(0);
    expect(undo(r.state).unit).toBeNull();
    const again = redo(r.state);
    expect(again.unit).toBe(0);
    expect(textOf(redo(again.state).state, 2)).toBe("Danke schön");
  });

  it("a new edit ends the redo history", () => {
    let s = setText(sample(), 0, "A");
    s = undo(s).state;
    s = setText(s, 0, "B");
    expect(canRedo(s)).toBe(false);
  });

  it("retranslating drops the edit and can be undone", () => {
    let s = setText(sample(), 1, "Mein Text");
    s = retranslated(s, 1, "Auf Wiedersehen", 0);
    expect(textOf(s, 1)).toBe("Auf Wiedersehen");
    expect(s.rows[2].hits).toBe(0);
    expect(editedCount(s)).toBe(0);
    s = undo(s).state;
    expect(textOf(s, 1)).toBe("Mein Text");
    expect(s.rows[2].base).toBe("Tschüss");
    expect(s.rows[2].hits).toBe(1);
  });

  it("a resumed draft keeps its edits and its engine translation apart", () => {
    const s = open(doc([seg(0, "Hello", "Guten Tag", { edited: true, base: "Hallo" })]));
    expect(textOf(s, 0)).toBe("Guten Tag");
    expect(s.rows[0].base).toBe("Hallo");
    expect(editedCount(s)).toBe(1);
    expect(textOf(setText(s, 0, "Hallo"), 0)).toBe("Hallo");
    expect(editedCount(setText(s, 0, "Hallo"))).toBe(0);
  });

  it("the filters show all, edited, glossary and left-as-they-were rows", () => {
    const s = setText(sample(), 0, "Guten Tag");
    expect(visibleRows(s, "all")).toEqual([0, 1, 2, 3]);
    expect(visibleRows(s, "edited")).toEqual([0]);
    expect(visibleRows(s, "glossary")).toEqual([2]);
    expect(visibleRows(s, "kept")).toEqual([1]);
    expect(filterCounts(s)).toEqual({ all: 4, edited: 1, glossary: 1, kept: 1 });
  });
});

describe("formatting markers", () => {
  const styles = [0, 1, 0];
  it("recognizes intact markers and rejects damaged ones", () => {
    expect(markersIntact("{1}Bitte {/1}{2}Anleitung{/2}{3} lesen{/3}", 3)).toBe(true);
    expect(markersIntact("{1}Bitte {/1}Anleitung{/2}{3} lesen{/3}", 3)).toBe(false);
    expect(markersIntact("{2}x{/2}{1}y{/1}{3}z{/3}", 3)).toBe(false);
    expect(markersIntact("{1}a{/1}{2}b{/2}{3}c{/3} {4}", 3)).toBe(false);
    expect(markersIntact("a {literal} brace", 1)).toBe(true);
  });

  it("splits a marked text into stretches with their formatting, markers hidden", () => {
    expect(pieces("{1}Bitte lesen Sie die {/1}{2}Bedienungsanleitung{/2}{3} sorgfältig.{/3}", styles)).toEqual([
      { text: "Bitte lesen Sie die ", style: 0 },
      { text: "Bedienungsanleitung", style: 1 },
      { text: " sorgfältig.", style: 0 },
    ]);
  });

  it("damaged markers are hidden and the text shown plain; text without markers is untouched", () => {
    expect(pieces("{1}Bitte{/1}Anleitung{/2}{3}x{/3}", styles)).toEqual([{ text: "BitteAnleitungx", style: 0 }]);
    expect(pieces("plain {1} text", [])).toEqual([{ text: "plain {1} text", style: 0 }]);
    expect(stripMarkers("{1}a{/1}{2}b{/2}")).toBe("ab");
  });
});

describe("which rows of a long list are drawn", () => {
  const heights = new Float64Array(1000);
  it("draws the window and a few rows around it, with spacers for the rest", () => {
    const r = rowRange(heights, 1000, 50, 5000, 500, 2);
    // Rows are 50 tall: 5000 is row 100, the window ends at row 110.
    expect(r.start).toBe(98);
    expect(r.end).toBe(112);
    expect(r.before).toBe(98 * 50);
    expect(r.after).toBe((1000 - 112) * 50);
    expect(r.total).toBe(50_000);
  });

  it("uses measured heights where known", () => {
    const h = new Float64Array(10);
    h[0] = 300;
    const r = rowRange(h, 10, 100, 250, 100, 0);
    expect(r.start).toBe(0);
    expect(offsetOf(h, 2, 100)).toBe(400);
  });

  it("handles an empty list and scrolling past the end", () => {
    expect(rowRange(heights, 0, 50, 0, 500).end).toBe(0);
    const r = rowRange(heights, 10, 50, 99_999, 500, 1);
    expect(r.end).toBe(10);
    expect(r.start).toBeLessThanOrEqual(9);
  });

  it("stays quick for a 300-page document (15,000 rows)", () => {
    const big = new Float64Array(15_000);
    const started = performance.now();
    for (let i = 0; i < 100; i++) rowRange(big, 15_000, 120, i * 700, 900);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

import { headerLabel } from "./editLabels";

describe("place labels", () => {
  const h = (part: string, extra: Partial<{ name: string | null; number: number | null; cell: string | null }> = {}) => ({ part, name: null, number: null, cell: null, ...extra });
  it("names the slide, its notes, the sheet and cell, and the page", () => {
    expect(headerLabel(h("slide", { number: 4 }))).toEqual({ key: "ed.h.slide", values: { n: 4 } });
    expect(headerLabel(h("notes", { number: 4 }))).toEqual({ key: "ed.h.notes", values: { n: 4 } });
    expect(headerLabel(h("sheet", { name: "Sales", cell: "B5" }))).toEqual({ key: "ed.h.sheet", values: { name: "Sales", cell: "B5" } });
    expect(headerLabel(h("sheet", { number: 3 }))).toEqual({ key: "ed.h.sheetText", values: { n: 3 } });
    expect(headerLabel(h("page", { number: 2 }))).toEqual({ key: "ed.h.page", values: { n: 2 } });
    expect(headerLabel(h("body", { number: 7 })).key).toBe("ed.h.body");
  });
});
