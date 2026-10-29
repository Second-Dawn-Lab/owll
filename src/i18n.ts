import { useI18n, type Vars } from "@seconddawn/i18n";
import { de } from "./locales/de";
import { en, type Key } from "./locales/en";

export const dictionaries = { en, de };
export const supportedLocales = Object.keys(dictionaries);

/** Typed `t`: only keys that exist in the English dictionary compile. */
export function useT() {
  const { t, locale } = useI18n();
  return { t: t as (key: Key, vars?: Vars) => string, locale };
}

/** Localized language name for a code like "de". */
export function languageName(code: string, locale: string, fallback?: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? fallback ?? code;
  } catch {
    return fallback ?? code;
  }
}

/** Active languages first, then alphabetical by the name shown in the UI language. */
export function sortLanguages<T extends { code: string; name: string; installed: boolean }>(list: T[], locale: string): T[] {
  return [...list].sort(
    (a, b) =>
      Number(b.installed) - Number(a.installed) ||
      languageName(a.code, locale, a.name).localeCompare(languageName(b.code, locale, b.name), locale),
  );
}
