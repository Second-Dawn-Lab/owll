import { describe, expect, it } from "vitest";
import { filterEntries, newEntry, nextListName } from "./glossaryList";

const entry = (id: number, source: string, target: string, from = "en", to = "de") => ({ ...newEntry(from, to), id, source, target });
const name = (c: string) => ({ en: "English", de: "German", fr: "French" })[c] ?? c;

describe("glossary list", () => {
  const entries = [entry(1, "owl", "Eule"), entry(2, "Kernel", "Kernel"), entry(3, "fox", "renard", "en", "fr")];

  it("is sorted by source term, ignoring case", () => {
    expect(filterEntries(entries, "", name).map((e) => e.source)).toEqual(["fox", "Kernel", "owl"]);
  });

  it("searches terms and language names", () => {
    expect(filterEntries(entries, "EUL", name).map((e) => e.id)).toEqual([1]);
    expect(filterEntries(entries, "french", name).map((e) => e.id)).toEqual([3]);
    expect(filterEntries(entries, "nothing", name)).toEqual([]);
  });

  it("a new entry has the defaults the engine expects", () => {
    expect(newEntry("en", "de")).toMatchObject({ id: 0, enabled: true, wholeWord: true, matchCase: false });
  });
});

describe("new glossary names", () => {
  it("uses the base name first and then numbers", () => {
    expect(nextListName([], "New glossary")).toBe("New glossary");
    expect(nextListName(["My glossary"], "New glossary")).toBe("New glossary");
    expect(nextListName(["New glossary"], "New glossary")).toBe("New glossary 2");
    expect(nextListName(["new glossary", "New glossary 2"], "New glossary")).toBe("New glossary 3");
  });
});
