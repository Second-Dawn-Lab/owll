import type { GlossaryEntry } from "../ipc";

/** A blank entry for the form (id 0: the backend gives it an id when it is saved). */
export function newEntry(from: string, to: string): GlossaryEntry {
  return { id: 0, from, to, source: "", target: "", matchCase: false, wholeWord: true, enabled: true };
}

/** The entries whose terms or language names contain `query` (ignoring case), sorted by source term. */
export function filterEntries(entries: GlossaryEntry[], query: string, languageName: (code: string) => string): GlossaryEntry[] {
  const q = query.trim().toLowerCase();
  return entries
    .filter((e) => !q || [e.source, e.target, languageName(e.from), languageName(e.to)].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => a.source.toLowerCase().localeCompare(b.source.toLowerCase()));
}

/** "New glossary", then "New glossary 2", "New glossary 3" ... the first name that no list has. */
export function nextListName(existing: string[], base: string): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** What "add" stores: the entry, and with "both directions" also the reverse pair (target -> source). */
export function entriesToAdd(entry: GlossaryEntry, bothDirections: boolean): GlossaryEntry[] {
  if (!bothDirections || entry.id !== 0) return [entry];
  return [entry, { ...entry, from: entry.to, to: entry.from, source: entry.target, target: entry.source }];
}

/** Is the entry complete: both terms written and two different languages. */
export function entryValid(entry: GlossaryEntry): boolean {
  return entry.source.trim() !== "" && entry.target.trim() !== "" && entry.from !== entry.to;
}

export interface PairGroup {
  from: string;
  to: string;
  entries: GlossaryEntry[];
}

/** The entries grouped by language pair ("English -> German"), groups sorted by their names, entries by term. */
export function groupByPair(entries: GlossaryEntry[], languageName: (code: string) => string): PairGroup[] {
  const groups = new Map<string, PairGroup>();
  for (const e of entries) {
    const key = `${e.from}>${e.to}`;
    const group = groups.get(key) ?? { from: e.from, to: e.to, entries: [] };
    group.entries.push(e);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, entries: [...g.entries].sort((a, b) => a.source.toLowerCase().localeCompare(b.source.toLowerCase())) }))
    .sort((a, b) => `${languageName(a.from)} ${languageName(a.to)}`.localeCompare(`${languageName(b.from)} ${languageName(b.to)}`));
}
