// File sizes and plural forms for the lists of the Files tab.

/** "512 B", "48.3 KB", "2.0 MB", "1.2 GB": one decimal, never "0 MB" for a small file. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  // 999.96 KB rounds to "1000.0": show it as 1.0 MB instead.
  while (Number(value.toFixed(1)) >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** "one" or "other" for a count in a language (English and German have these two). */
export function pluralForm(locale: string, count: number): "one" | "other" {
  return new Intl.PluralRules(locale).select(count) === "one" ? "one" : "other";
}
