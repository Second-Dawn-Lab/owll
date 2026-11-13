import { describe, expect, it } from "vitest";
import type { WritePiece } from "../ipc";
import { acceptedCount, applyPieces, changeCount, toggled } from "./writeModel";

const pieces: WritePiece[] = [
  { kind: "same", text: "I " },
  { kind: "change", id: 0, old: "has", new: "have" },
  { kind: "same", text: " a dog and a cat" },
  { kind: "change", id: 1, old: ".", new: "!" },
];

describe("write changes", () => {
  it("counts the changes", () => {
    expect(changeCount(pieces)).toBe(2);
  });
  it("accept all gives the rewrite, reject all gives the original", () => {
    expect(applyPieces(pieces, [true, true])).toBe("I have a dog and a cat!");
    expect(applyPieces(pieces, [false, false])).toBe("I has a dog and a cat.");
  });
  it("accepts one change on its own", () => {
    expect(applyPieces(pieces, [true, false])).toBe("I have a dog and a cat.");
    const next = toggled([true, true], 1);
    expect(next).toEqual([true, false]);
    expect(acceptedCount(next)).toBe(1);
  });
  it("treats a missing entry as not accepted", () => {
    expect(applyPieces(pieces, [])).toBe("I has a dog and a cat.");
  });
});
