import type { LanguageInfo } from "../ipc";

/**
 * What choosing a language in the first-run list does, with the same states as the Language packs page:
 *
 * - "active": already in the pickers.
 * - "activate": its files are on disk (shared with another language such as Urdu), so ticking it only
 *   switches it on, with no download.
 * - "download": its pack has to be downloaded.
 */
export type ChoiceState = "active" | "activate" | "download";

export function choiceState(language: Pick<LanguageInfo, "installed" | "available">): ChoiceState {
  if (language.installed) return "active";
  return language.available ? "activate" : "download";
}

/** The languages to offer (English is built in), sorted by the name shown in the UI language. */
export function choicesSorted<T extends Pick<LanguageInfo, "builtIn" | "code">>(languages: T[], locale: string, nameOf: (language: T) => string): T[] {
  return languages
    .filter((l) => !l.builtIn)
    .map((l) => ({ l, name: nameOf(l) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale))
    .map((x) => x.l);
}

/** What the chosen languages need: downloads (with their size) and plain activations. */
export function planChoices(languages: Pick<LanguageInfo, "code" | "installed" | "available" | "sizeBytes" | "totalBytes">[], chosen: string[]) {
  const download: string[] = [];
  const activate: string[] = [];
  let bytes = 0;
  for (const code of chosen) {
    const l = languages.find((x) => x.code === code);
    if (!l) continue;
    const state = choiceState(l);
    if (state === "download") {
      download.push(code);
      bytes += l.sizeBytes || l.totalBytes;
    } else if (state === "activate") {
      activate.push(code);
    }
  }
  return { download, activate, bytes };
}
