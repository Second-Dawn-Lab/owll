import { describe, expect, it } from "vitest";
import { rewriteView } from "./rewriteView";

describe("result state after the model's rewrite", () => {
  it("a rewrite that equals the fast translation (the glossary sentence) is still polished, with the toggle", () => {
    // "The owls are hunting in the forest at night." was already "Die Eulen jagen nachts im Wald." and came back the same.
    const v = rewriteView({ text: "Die Eulen jagen nachts im Wald.", kept: 0, sentences: 1 }, false);
    expect(v).toEqual({ hasRewrite: true, polished: true, fastShown: false });
  });

  it("the same with and without glossary terms: only the model's use matters, not whether the text changed", () => {
    for (const text of ["Die Eulen jagen nachts im Wald.", "Hallo, wie geht's?"]) {
      expect(rewriteView({ text, kept: 0, sentences: 1 }, false).polished).toBe(true);
    }
  });

  it("asking for the fast version keeps the toggle and says the fast one is shown", () => {
    expect(rewriteView({ text: "x", kept: 0, sentences: 2 }, true)).toEqual({ hasRewrite: true, polished: false, fastShown: true });
  });

  it("when the answer was not used for any sentence nothing is polished", () => {
    expect(rewriteView({ text: "x", kept: 2, sentences: 2 }, false)).toEqual({ hasRewrite: false, polished: false, fastShown: false });
    expect(rewriteView(null, false).polished).toBe(false);
  });

  it("some sentences kept, some polished: polished", () => {
    expect(rewriteView({ text: "x", kept: 1, sentences: 3 }, false).polished).toBe(true);
  });
});
