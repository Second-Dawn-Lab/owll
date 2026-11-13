import { useEffect, useState } from "react";
import { ipc, type SpellSuggestion } from "../ipc";

/** The part of the corrected text from the first changed word to the last: "software developer". */
export function suggestionSpan(original: string, suggestion: SpellSuggestion): string {
  const { corrected } = suggestion;
  let start = 0;
  while (start < original.length && start < corrected.length && original[start] === corrected[start]) start++;
  let endO = original.length;
  let endC = corrected.length;
  while (endO > start && endC > start && original[endO - 1] === corrected[endC - 1]) {
    endO--;
    endC--;
  }
  // Whole words around the change.
  let from = start;
  while (from > 0 && /\S/.test(corrected[from - 1] ?? " ")) from--;
  let to = endC;
  while (to < corrected.length && /\S/.test(corrected[to] ?? " ")) to++;
  return corrected.slice(from, to).trim();
}

/**
 * "Did you mean ...?" for the source text, from the installed dictionary of the source language. Asked a moment after typing
 * stops, only while `enabled` (without Quality mode: with it, the model understands the text as it is).
 */
export function useSpellSuggestion(text: string, lang: string | null, enabled: boolean): { suggestion: SpellSuggestion | null; dismiss: () => void } {
  const [found, setFound] = useState<{ text: string; suggestion: SpellSuggestion } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !lang || text.trim().length < 4) {
      setFound(null);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      void ipc
        .spellSuggest(text, lang)
        .then((s) => !stale && setFound(s ? { text, suggestion: s } : null))
        .catch(() => !stale && setFound(null));
    }, 700);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [text, lang, enabled]);

  // A suggestion belongs to the text it was made for; typing on makes it go away until the next answer.
  const current = found && found.text === text && dismissed !== text ? found.suggestion : null;
  return { suggestion: current, dismiss: () => setDismissed(text) };
}
