import { describe, expect, it } from "vitest";
import { suggestionSpan } from "./useSpellSuggestion";

describe("did-you-mean text", () => {
  it("shows the changed words in context", () => {
    const s = { corrected: "hi how are you ? i m software developer", fixes: [{ word: "softwar", replacement: "software" }, { word: "devloper", replacement: "developer" }] };
    expect(suggestionSpan("hi how are you ? i m softwar devloper", s)).toBe("software developer");
  });
  it("one changed word is just that word", () => {
    expect(suggestionSpan("please sned the invoice", { corrected: "please send the invoice", fixes: [{ word: "sned", replacement: "send" }] })).toBe("send");
  });
});
