import { describe, expect, it } from "vitest";
import { applyPick, wordsOf, type SegmentLike } from "./resultWords";

const seg = (target: string, start: number, extra: Partial<SegmentLike> = {}): SegmentLike => ({ source: "s", input: "s", target, start, end: start + target.length, pinned: false, ...extra });

describe("words of a translation", () => {
  it("finds words with their offsets, keeping apostrophes and hyphens inside words", () => {
    const words = wordsOf("Die Katze, die dämmert; it's well-known.");
    expect(words.map((w) => w.text)).toEqual(["Die", "Katze", "die", "dämmert", "it's", "well-known"]);
    expect(words[1]).toEqual({ text: "Katze", start: 4, end: 9 });
  });

  it("counts offsets in UTF-16 units, like the backend", () => {
    const words = wordsOf("\u{1F989} Eule schläft");
    expect(words[0]).toEqual({ text: "Eule", start: 3, end: 7 });
  });

  it("works for right-to-left text", () => {
    const words = wordsOf("آپ کیسے ہیں؟");
    expect(words).toHaveLength(3);
    expect(words[0].start).toBe(0);
  });
});

describe("choosing an alternative", () => {
  const text = "Die Katze schläft. Der Hund bellt.";
  const segments = [seg("Die Katze schläft.", 0), seg("Der Hund bellt.", 22 - 1)];

  it("replaces only that sentence and moves the later segments", () => {
    const first = text.indexOf("Der");
    const segs = [seg("Die Katze schläft.", 0), seg("Der Hund bellt.", first)];
    const out = applyPick(text, segs, 0, "Das Kind schläft tief.");
    expect(out.text).toBe("Das Kind schläft tief. Der Hund bellt.");
    expect(out.segments[0]).toMatchObject({ target: "Das Kind schläft tief.", start: 0, pinned: true });
    expect(out.text.slice(out.segments[1].start, out.segments[1].end)).toBe("Der Hund bellt.");
    expect(out.segments[1].pinned).toBe(false);
  });

  it("keeps earlier sentences and shrinking works too", () => {
    const first = text.indexOf("Der");
    const segs = [seg("Die Katze schläft.", 0), seg("Der Hund bellt.", first)];
    const out = applyPick(text, segs, 1, "Er bellt.");
    expect(out.text).toBe("Die Katze schläft. Er bellt.");
    expect(out.segments[0]).toBe(segs[0]);
    expect(out.text.slice(out.segments[1].start, out.segments[1].end)).toBe("Er bellt.");
  });

  it("does nothing for an unknown segment", () => {
    expect(applyPick(text, segments, 5, "x")).toEqual({ text, segments });
  });
});

describe("a choice sticks while the user keeps typing", () => {
  // The backend pins (from, to, source sentence); the rule the page relies on is that a pinned segment is reported as such.
  it("marks the chosen sentence as pinned so it is shown as chosen", () => {
    const out = applyPick("Hallo.", [seg("Hallo.", 0)], 0, "Guten Tag.");
    expect(out.segments[0].pinned).toBe(true);
  });
});
