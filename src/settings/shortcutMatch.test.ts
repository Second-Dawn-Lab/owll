import { describe, expect, it } from "vitest";
import { comboOf, sameCombo } from "./shortcutMatch";

describe("capture shortcut matching", () => {
  it("matches the same keys in any order and case", () => {
    expect(sameCombo("Ctrl+Shift+O", "Ctrl+Shift+O")).toBe(true);
    expect(sameCombo("Shift+Ctrl+O", "Ctrl+Shift+O")).toBe(true);
    expect(sameCombo("ctrl+shift+o", "Ctrl+Shift+O")).toBe(true);
  });

  it("does not match other keys or modifiers", () => {
    expect(sameCombo("Ctrl+O", "Ctrl+Shift+O")).toBe(false);
    expect(sameCombo("Ctrl+Shift+P", "Ctrl+Shift+O")).toBe(false);
    expect(sameCombo(null, "Ctrl+Shift+O")).toBe(false);
  });

  it("ignores press-twice shortcuts, which only the keyboard hook can detect", () => {
    expect(comboOf("Ctrl+C C")).toBeNull();
    expect(sameCombo("Ctrl+C", "Ctrl+C C")).toBe(false);
  });
});
