import { describe, expect, it } from "vitest";
import { docFailureKey, dropTarget } from "./docFiles";

describe("dropped files", () => {
  it("documents go to the Files tab and pictures to the Images tab", () => {
    expect(dropTarget("C:\\Users\\me\\Report.DOCX")).toBe("document");
    expect(dropTarget("/home/me/slides.pptx")).toBe("document");
    expect(dropTarget("notes.md")).toBe("document");
    expect(dropTarget("scan.PDF")).toBe("document");
    expect(dropTarget("photo.jpeg")).toBe("image");
    expect(dropTarget("shot.png")).toBe("image");
  });

  it("anything else is left alone", () => {
    expect(dropTarget("setup.exe")).toBe("other");
    expect(dropTarget("noextension")).toBe("other");
    expect(dropTarget("archive.zip")).toBe("other");
  });
});

describe("failure messages", () => {
  it("every backend code has its own message, unknown ones a generic one", () => {
    for (const code of ["unsupported", "encrypted", "corrupt", "scanned", "too_large", "cancelled", "pack_missing", "model_load", "busy"]) {
      expect(docFailureKey(code)).toBe(`files.failed.${code}`);
    }
    expect(docFailureKey("io")).toBe("files.failed.other");
    expect(docFailureKey("translate")).toBe("files.failed.other");
  });
});
