import { describe, expect, it } from "vitest";
import { activeKind, writeErrorKey } from "./writeError";

describe("write errors", () => {
  it("explains a rejected answer and does not offer to try again (the same text gives the same answer)", () => {
    for (const code of ["quality_rejected_too_long", "quality_rejected_wrong_language", "quality_rejected_changed_meaning", "quality_rejected_degenerate", "quality_rejected_empty", "quality_rejected_too_short"]) {
      expect(writeErrorKey(code).retryHelps).toBe(false);
    }
    expect(writeErrorKey("quality_rejected_too_long").key).toBe("write.err.tooLong");
    expect(writeErrorKey("quality_rejected_changed_meaning").key).toBe("write.err.changedMeaning");
  });

  it("a model that could not run can be tried again", () => {
    expect(writeErrorKey("quality_low_memory")).toEqual({ key: "write.err.unavailable", retryHelps: true });
    expect(writeErrorKey("whatever")).toEqual({ key: "write.error", retryHelps: true });
  });
});

describe("the marked action button", () => {
  it("stays marked after a failure, for the same text, and goes when the text changes", () => {
    expect(activeKind("fixGrammar", null, "x")).toBe("fixGrammar");
    expect(activeKind(null, { kind: "improve", source: "i and me go zoo" }, "i and me go zoo")).toBe("improve");
    expect(activeKind(null, { kind: "improve", source: "i and me go zoo" }, "another text")).toBeNull();
    expect(activeKind(null, null, "x")).toBeNull();
  });
});
