import { describe, expect, it } from "vitest";
import { entriesToAdd, entryValid, filterEntries, groupByPair, newEntry, nextListName } from "./glossaryList";

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

describe("adding a term", () => {
  const draft = { ...newEntry("en", "de"), source: "owl", target: "Eule" };

  it("adds one entry, or two with 'both directions' (the reverse pair)", () => {
    expect(entriesToAdd(draft, false)).toEqual([draft]);
    const both = entriesToAdd(draft, true);
    expect(both).toHaveLength(2);
    expect(both[1]).toMatchObject({ from: "de", to: "en", source: "Eule", target: "owl", wholeWord: true, matchCase: false, enabled: true });
  });

  it("an edit never adds a reverse entry", () => {
    expect(entriesToAdd({ ...draft, id: 7 }, true)).toHaveLength(1);
  });

  it("needs both terms and two different languages", () => {
    expect(entryValid(draft)).toBe(true);
    expect(entryValid({ ...draft, target: " " })).toBe(false);
    expect(entryValid({ ...draft, to: "en" })).toBe(false);
  });
});

describe("the list grouped by language pair", () => {
  const names = (c: string) => ({ en: "English", de: "German", fr: "French" })[c] ?? c;
  it("groups by pair, sorts groups by name and entries by term", () => {
    const entries = [entry(1, "owl", "Eule"), entry(2, "fox", "renard", "en", "fr"), entry(3, "cat", "Katze"), entry(4, "Eule", "owl", "de", "en")];
    const groups = groupByPair(entries, names);
    expect(groups.map((g) => `${g.from}>${g.to}`)).toEqual(["en>fr", "en>de", "de>en"]);
    expect(groups[1].entries.map((e) => e.source)).toEqual(["cat", "owl"]);
  });
});
