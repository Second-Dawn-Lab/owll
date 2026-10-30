import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript module without types
import { latestJson, releaseNotes } from "./make-latest-json.mjs";

const changelog = `# Changelog

## [0.2.0] - 2026-12-01

- Newer.

## [0.1.0] - 2026-11-01

First release.

- One.
- Two.
`;

describe("release notes", () => {
  it("takes the section of the version up to the next heading", () => {
    expect(releaseNotes(changelog, "0.1.0")).toBe("First release.\n\n- One.\n- Two.");
    expect(releaseNotes(changelog, "0.2.0")).toBe("- Newer.");
  });
  it("is empty for an unknown version (the workflow then fails)", () => {
    expect(releaseNotes(changelog, "0.3.0")).toBe("");
    expect(releaseNotes(changelog, "0.1")).toBe("");
  });
});

describe("latest.json", () => {
  it("points at the tagged release asset with the signature", () => {
    const json = latestJson({ tag: "v0.1.0", installerName: "Owl-L_0.1.0_x64-setup.exe", signature: "SIG\n", notes: "n", now: new Date(0) });
    expect(json.version).toBe("0.1.0");
    expect(json.platforms["windows-x86_64"]).toEqual({
      signature: "SIG",
      url: "https://github.com/Second-Dawn-Lab/owll/releases/download/v0.1.0/Owl-L_0.1.0_x64-setup.exe",
    });
    expect(json.pub_date).toBe("1970-01-01T00:00:00.000Z");
  });
});
