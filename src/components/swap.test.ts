import { describe, expect, it } from "vitest";
import { swapPlan, type SwapInput } from "./swap";

const done: SwapInput = { from: "auto", to: "de", status: "done", detected: "en", resolvedFrom: "en", effectiveTo: "de", result: "Mein Name ist Ali", fresh: true, input: "my name is ali" };

describe("swap", () => {
  it("flips the languages and the text together: the result becomes the source", () => {
    expect(swapPlan(done)).toEqual({ source: "de", target: "en", text: "Mein Name ist Ali" });
  });

  it("uses the languages the translator really used, not only what the pickers say", () => {
    // The pickers said German to German; the text went to the smart target English.
    const plan = swapPlan({ ...done, from: "de", to: "de", resolvedFrom: "de", effectiveTo: "en", result: "My name is Ali", input: "Mein Name ist Ali" });
    expect(plan).toEqual({ source: "en", target: "de", text: "My name is Ali" });
  });

  it("uses the polished result as the new source (the shown text, not the fast one)", () => {
    const plan = swapPlan({ ...done, result: "Die Eulen schlafen tagsüber." });
    expect(plan?.text).toBe("Die Eulen schlafen tagsüber.");
  });

  it("keeps the text when there is no fresh result, and cannot swap an unknown language", () => {
    expect(swapPlan({ ...done, status: "translating", fresh: false })).toEqual({ source: "de", target: "en", text: "my name is ali" });
    expect(swapPlan({ ...done, status: "idle", from: "auto", detected: null, resolvedFrom: null })).toBeNull();
  });
});
