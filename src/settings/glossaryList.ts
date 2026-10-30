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
