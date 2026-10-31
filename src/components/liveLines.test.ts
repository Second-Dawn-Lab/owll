import { describe, expect, it } from "vitest";
import { addLines, HISTORY_LINES, shownLines, transcriptText } from "./liveLines";

const line = (n: number) => ({ original: `orig ${n}`, translation: `trans ${n}` });

describe("the caption bar's lines", () => {
  it("shows the latest lines, oldest first, one to three of them", () => {
    let list = addLines([], [line(1), line(2), line(3), line(4)], false);
    expect(shownLines(list, 2).map((c) => c.translation)).toEqual(["trans 3", "trans 4"]);
    expect(shownLines(list, 1).map((c) => c.translation)).toEqual(["trans 4"]);
    expect(shownLines(list, 9)).toHaveLength(3);
    expect(shownLines(list, 0)).toHaveLength(1);
    list = addLines(list, [line(5)], false);
    expect(shownLines(list, 2).map((c) => c.translation)).toEqual(["trans 4", "trans 5"]);
  });

  it("a caption that grew replaces its earlier line", () => {
    const list = addLines(addLines([], [line(1), line(2)], false), [{ original: "orig 2 longer", translation: "trans 2 longer" }], true);
    expect(list.map((c) => c.translation)).toEqual(["trans 1", "trans 2 longer"]);
  });

  it("keeps about fifty lines and drops the oldest", () => {
    let list = addLines([], [], false);
    for (let i = 0; i < HISTORY_LINES + 20; i++) list = addLines(list, [line(i)], false);
    expect(list).toHaveLength(HISTORY_LINES);
    expect(list[0].translation).toBe("trans 20");
  });

  it("writes a transcript with the original under each translation", () => {
    const list = addLines([], [line(1), line(2)], false);
    expect(transcriptText(list)).toBe("trans 1\n  (orig 1)\n\ntrans 2\n  (orig 2)\n");
    expect(transcriptText([])).toBe("");
  });
});
