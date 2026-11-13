import { describe, expect, it } from "vitest";
import { effectiveTone, toneAvailable } from "./toneLanguages";

describe("tone availability", () => {
  it("is offered for languages with formal and informal address", () => {
    for (const l of ["de", "fr", "es", "it", "ru", "ja", "tr", "hi", "ur"]) expect(toneAvailable(l)).toBe(true);
  });
  it("is not offered for English, Chinese or Arabic", () => {
    for (const l of ["en", "zh", "ar"]) expect(toneAvailable(l)).toBe(false);
  });
  it("sends automatic for a language without tones", () => {
    expect(effectiveTone("en", "formal")).toBe("automatic");
    expect(effectiveTone("de", "formal")).toBe("formal");
  });
});
