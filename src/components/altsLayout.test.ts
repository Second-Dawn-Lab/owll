import { describe, expect, it } from "vitest";
import { ALT_ROW_HEIGHT, altsSize, previewRest } from "./altsLayout";

describe("alternatives list size", () => {
  it("is as tall as its items, up to eight rows, with no scrolling", () => {
    expect(altsSize(1, 800)).toEqual({ rows: 1, height: ALT_ROW_HEIGHT, scrolls: false });
    expect(altsSize(5, 800)).toEqual({ rows: 5, height: 5 * ALT_ROW_HEIGHT, scrolls: false });
    expect(altsSize(8, 800)).toEqual({ rows: 8, height: 8 * ALT_ROW_HEIGHT, scrolls: false });
  });

  it("scrolls beyond eight items", () => {
    expect(altsSize(10, 800)).toEqual({ rows: 8, height: 8 * ALT_ROW_HEIGHT, scrolls: true });
  });

  it("is kept on screen: a short window gives fewer rows and scrolls, never fewer than two", () => {
    expect(altsSize(10, 100)).toEqual({ rows: 3, height: 3 * ALT_ROW_HEIGHT, scrolls: true });
    expect(altsSize(10, 20).rows).toBe(2);
    expect(altsSize(0, 500).rows).toBe(1);
  });
});

describe("preview next to the word", () => {
  it("does not repeat the word", () => {
    expect(previewRest("\u00fcberrascht", "\u00fcberrascht, weil sie kam")).toBe(", weil sie kam");
    expect(previewRest("Eule", "eule schl\u00e4ft \u2026")).toBe("schl\u00e4ft \u2026");
  });

  it("shows an ellipsis when only punctuation follows", () => {
    expect(previewRest("erstaunt", "erstaunt.")).toBe("\u2026");
    expect(previewRest("x", "")).toBe("\u2026");
  });
});
