import { describe, expect, it } from "vitest";
import { choiceState, choicesSorted, planChoices } from "./onboardingState";

const lang = (code: string, extra: object = {}) => ({ code, builtIn: false, installed: false, available: false, sizeBytes: 100, totalBytes: 100, ...extra });

describe("onboarding language order", () => {
  const names: Record<string, Record<string, string>> = {
    en: { es: "Spanish", fr: "French", de: "German", ur: "Urdu", bn: "Bangla", en: "English" },
    de: { es: "Spanisch", fr: "Französisch", de: "Deutsch", ur: "Urdu", bn: "Bengalisch", en: "Englisch" },
  };
  const all = ["es", "fr", "de", "ur", "bn", "en"].map((c) => lang(c, { builtIn: c === "en" }));

  it("is sorted by the name in the UI language, not by code", () => {
    const en = choicesSorted(all, "en", (l) => names.en[l.code]).map((l) => l.code);
    expect(en).toEqual(["bn", "fr", "de", "es", "ur"]); // Bangla, French, German, Spanish, Urdu
    const de = choicesSorted(all, "de", (l) => names.de[l.code]).map((l) => l.code);
    expect(de).toEqual(["bn", "de", "fr", "es", "ur"]); // Bengalisch, Deutsch, Französisch, Spanisch, Urdu
  });

  it("leaves out English (built in) and keeps every other language", () => {
    const codes = choicesSorted(all, "en", (l) => names.en[l.code]).map((l) => l.code);
    expect(codes).not.toContain("en");
    expect(codes).toHaveLength(5);
  });
});

describe("onboarding states", () => {
  it("shared files on disk do not make a language active", () => {
    // Urdu is active; Hindi's files are on disk because Urdu shares them, but Hindi was never activated.
    expect(choiceState(lang("ur", { installed: true, available: true }))).toBe("active");
    expect(choiceState(lang("hi", { installed: false, available: true }))).toBe("activate");
    expect(choiceState(lang("fr"))).toBe("download");
  });

  it("plans downloads and activations separately, counting only what must be downloaded", () => {
    const languages = [lang("ur", { installed: true, available: true }), lang("hi", { available: true, sizeBytes: 0, totalBytes: 450 }), lang("fr", { sizeBytes: 130, totalBytes: 130 }), lang("de", { sizeBytes: 120 })];
    expect(planChoices(languages, ["hi", "fr", "de", "ur", "xx"])).toEqual({ download: ["fr", "de"], activate: ["hi"], bytes: 250 });
    expect(planChoices(languages, ["hi"])).toEqual({ download: [], activate: ["hi"], bytes: 0 });
  });
});
