import type { Vars } from "@seconddawn/i18n";
import type { Key } from "../locales/en";

type T = (key: Key, vars?: Vars) => string;

/** A friendly sentence for a failed language download. */
export function packErrorText(t: T, code: string | null, fallback: string | null): string {
  switch (code) {
    case "checksum":
      return t("pack.err.checksum");
    case "network":
      return t("pack.err.network");
    case "not_published":
      return t("pack.err.notPublished");
    case "invalid_archive":
      return t("pack.err.invalid");
    case "io":
      return t("pack.err.io");
    default:
      return fallback ?? t("pack.err.unknown");
  }
}

/** A friendly sentence for text that could not be recognized. */
export function ocrProblemText(t: T, problem: { code: string; languages: string[] }, nameOf: (code: string) => string): string {
  switch (problem.code) {
    case "no_text":
      return t("quick.noText");
    case "language_missing":
      return t("quick.ocrMissing", { langs: problem.languages.map(nameOf).join(", ") });
    case "unsupported":
      return t("quick.ocrUnsupported");
    default:
      return t("quick.ocrFailed");
  }
}
