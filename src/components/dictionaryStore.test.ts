import { describe, expect, it } from "vitest";
import { getDictionaryState, setPanelOpen, showWord, wordAt } from "./dictionaryStore";

describe("which word is meant", () => {
  const text = "Die Häuser, die ich sah – don't stop!";
  it("takes the word around the caret, without punctuation", () => {
    expect(wordAt(text, 6, 6)).toBe("Häuser");
    expect(wordAt(text, 4, 4)).toBe("Häuser");
    expect(wordAt(text, text.indexOf("don"), text.indexOf("don"))).toBe("don't");
    expect(wordAt(text, text.length - 1, text.length - 1)).toBe("stop");
  });

  it("takes a selected single word, trimmed, and refuses a selection of several words", () => {
    expect(wordAt(text, 4, 11)).toBe("Häuser");
    expect(wordAt(text, 4, 12)).toBe("Häuser");
    expect(wordAt(text, 0, 10)).toBeNull();
  });

  it("finds nothing in spaces and punctuation", () => {
    expect(wordAt("a  –  b", 3, 3)).toBeNull();
    expect(wordAt("", 0, 0)).toBeNull();
  });
});

describe("the shared lookup", () => {
  it("keeps the last word and opens the panel only when asked", () => {
    setPanelOpen(false);
    showWord({ word: "Haus", lang: "de", partner: "en" });
    expect(getDictionaryState()).toMatchObject({ query: { word: "Haus" }, open: false });
    showWord({ word: "Hund", lang: "de", partner: "en" }, true);
    expect(getDictionaryState()).toMatchObject({ query: { word: "Hund" }, open: true });
    // A lookup that does not ask to open leaves an open panel open.
    showWord({ word: "Katze", lang: "de", partner: "en" });
    expect(getDictionaryState().open).toBe(true);
  });
});
