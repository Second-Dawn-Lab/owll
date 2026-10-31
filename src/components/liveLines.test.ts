import { describe, expect, it } from "vitest";
import { addLines, choiceToRemember, decideSave, MAX_LINES, timeRange, transcriptText } from "./liveLines";
import { atBottom, endOf, initialScroll, jump, onLines, onScroll, showJump } from "./scrollModel";

const line = (n: number) => ({ original: `orig ${n}`, translation: `trans ${n}` });

describe("the conversation of a session", () => {
  it("keeps every line with the time it appeared, oldest first", () => {
    const list = addLines(addLines([], [line(1), line(2)], false, 1000), [line(3)], false, 2000);
    expect(list.map((c) => [c.translation, c.at])).toEqual([["trans 1", 1000], ["trans 2", 1000], ["trans 3", 2000]]);
  });

  it("a caption that grew replaces its earlier line and keeps that line's time and place", () => {
    const first = addLines([], [line(1), line(2)], false, 1000);
    const list = addLines(first, [{ original: "orig 2 longer", translation: "trans 2 longer" }], true, 5000);
    expect(list.map((c) => c.translation)).toEqual(["trans 1", "trans 2 longer"]);
    expect(list[1]).toMatchObject({ at: 1000, id: first[1].id });
  });

  it("keeps up to two thousand lines and drops the oldest", () => {
    let list = addLines([], [], false);
    for (let i = 0; i < MAX_LINES + 50; i++) list = addLines(list, [line(i)], false, i);
    expect(list).toHaveLength(MAX_LINES);
    expect(list[0].translation).toBe("trans 50");
    expect(list[MAX_LINES - 1].translation).toBe(`trans ${MAX_LINES + 49}`);
  });

  it("writes a transcript with the time, the translation and the original under it", () => {
    const list = addLines([], [line(1), line(2)], false, new Date(2026, 0, 1, 14, 5, 9).getTime());
    expect(transcriptText(list, "en")).toBe("[14:05:09] trans 1\n  (orig 1)\n\n[14:05:09] trans 2\n  (orig 2)\n");
    expect(transcriptText([], "en")).toBe("");
    // The lines of a saved session use `t` for the time.
    expect(transcriptText([{ t: new Date(2026, 0, 1, 9, 0, 0).getTime(), original: "a", translation: "b" }], "en")).toBe("[09:00:00] b\n  (a)\n");
  });

  it("formats the time range of a session", () => {
    expect(timeRange(new Date(2026, 0, 1, 14, 5).getTime(), new Date(2026, 0, 1, 14, 42).getTime(), "en")).toBe("14:05–14:42");
  });
});

describe("what happens to the conversation when the session ends", () => {
  it("asks by default, follows a remembered choice, and has nothing to do without lines", () => {
    expect(decideSave("ask", 12)).toBe("ask");
    expect(decideSave("always", 12)).toBe("save");
    expect(decideSave("never", 12)).toBe("skip");
    expect(decideSave("nonsense", 12)).toBe("ask");
    expect(decideSave("always", 0)).toBe("nothing");
  });

  it("remembers the answer only when the box is ticked", () => {
    expect(choiceToRemember(true, true)).toBe("always");
    expect(choiceToRemember(false, true)).toBe("never");
    expect(choiceToRemember(true, false)).toBeNull();
    expect(choiceToRemember(false, false)).toBeNull();
  });
});

describe("scrolling the conversation", () => {
  const view = { clientHeight: 300, scrollHeight: 1000 };

  it("is at the bottom within a few pixels of the end", () => {
    expect(atBottom({ ...view, scrollTop: 700 })).toBe(true);
    expect(atBottom({ ...view, scrollTop: 690 })).toBe(true);
    expect(atBottom({ ...view, scrollTop: 600 })).toBe(false);
    expect(atBottom({ clientHeight: 300, scrollHeight: 200, scrollTop: 0 })).toBe(true);
    expect(endOf(view)).toBe(700);
  });

  it("follows new lines while at the bottom and counts them once the reader scrolled up", () => {
    let state = onLines(initialScroll, 3);
    expect(state).toEqual({ following: true, unseen: 0 });
    expect(showJump(state)).toBe(false);
    state = onScroll(state, false);
    expect(state.following).toBe(false);
    expect(showJump(state)).toBe(false);
    state = onLines(onLines(state, 2), 1);
    expect(state).toEqual({ following: false, unseen: 3 });
    expect(showJump(state)).toBe(true);
  });

  it("scrolling back to the bottom, or the button, follows again and clears the count", () => {
    const away = onLines(onScroll(initialScroll, false), 4);
    expect(onScroll(away, true)).toEqual({ following: true, unseen: 0 });
    expect(jump()).toEqual({ following: true, unseen: 0 });
    // Scrolling while still away keeps the count.
    expect(onScroll(away, false).unseen).toBe(4);
  });
});
