import { describe, expect, it } from "vitest";
import { classifyCheckError, outcomeOf } from "./updateOutcome";

describe("update check outcome", () => {
  it("an update is available", () => {
    expect(outcomeOf({ update: { version: "0.2.0", body: "Notes" } })).toEqual({ kind: "available", version: "0.2.0", body: "Notes" });
    expect(outcomeOf({ update: { version: "0.2.0" } })).toEqual({ kind: "available", version: "0.2.0", body: "" });
  });

  it("no update means up to date", () => {
    expect(outcomeOf({ update: null })).toEqual({ kind: "uptodate" });
  });

  it("no connection is offline", () => {
    for (const message of [
      "error sending request for url (https://github.com/Second-Dawn-Lab/owll/releases/latest/download/latest.json)",
      "dns error: No such host is known. (os error 11001)",
      "tcp connect error: A connection attempt failed",
      "operation timed out",
      "something unexpected",
    ]) {
      expect(outcomeOf({ error: new Error(message) }), message).toEqual({ kind: "offline" });
    }
  });

  it("a reachable server without latest.json is 'no release'", () => {
    // What tauri-plugin-updater reports when the endpoint answers with 404 (no published release) ...
    expect(classifyCheckError("Could not fetch a valid release JSON from the remote")).toBe("norelease");
    // ... or answers 200 with something that is not a release manifest.
    expect(classifyCheckError("expected value at line 1 column 1")).toBe("norelease");
    expect(classifyCheckError("missing field `version` at line 1 column 2")).toBe("norelease");
    expect(outcomeOf({ error: "Could not fetch a valid release JSON from the remote" })).toEqual({ kind: "norelease" });
  });

  it("a network message wins when both could match", () => {
    expect(classifyCheckError("error sending request: connection refused (404?)")).toBe("offline");
  });
});
