import { describe, expect, it } from "vitest";
import { formatFileSize, pluralForm } from "./fileSize";

describe("file sizes", () => {
  it("uses bytes, KB, MB and GB with one decimal", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1000)).toBe("1.0 KB");
    expect(formatFileSize(48_300)).toBe("48.3 KB");
    expect(formatFileSize(2_000_000)).toBe("2.0 MB");
    expect(formatFileSize(1_234_567_890)).toBe("1.2 GB");
  });

  it("never shows 0 MB for a small file and rolls a rounded 1000.0 over to the next unit", () => {
    expect(formatFileSize(120_000)).toBe("120.0 KB");
    expect(formatFileSize(999_960)).toBe("1.0 MB");
    expect(formatFileSize(4_096)).toBe("4.1 KB");
  });

  it("copes with nonsense", () => {
    expect(formatFileSize(-1)).toBe("");
    expect(formatFileSize(Number.NaN)).toBe("");
  });
});

describe("plural forms", () => {
  it("separates one from the rest in English and German", () => {
    expect(pluralForm("en", 1)).toBe("one");
    expect(pluralForm("en", 0)).toBe("other");
    expect(pluralForm("en", 2)).toBe("other");
    expect(pluralForm("de", 1)).toBe("one");
    expect(pluralForm("de", 5)).toBe("other");
  });
});
