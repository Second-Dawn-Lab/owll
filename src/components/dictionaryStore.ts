// The word the dictionary panels show: the last word looked up, wherever it was clicked (a word of the translation, a word of the
// source, a word in the document editor). Shared by the popup's Dictionary tab and the collapsible panels.

import { useSyncExternalStore } from "react";

export interface DictQuery {
  /** The word as written in the text. */
  word: string;
  /** Its language. */
  lang: string;
  /** The other language of the translation: the dictionary translates into it when there is one. */
  partner: string;
}

interface State {
  query: DictQuery | null;
  open: boolean;
}

let state: State = { query: null, open: false };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

/** Show a word in the panel; `open` unfolds the panel too (a lookup in the source text does, one in the popup leaves it as it is). */
export function showWord(query: DictQuery, open = false) {
  set({ query, open: open || state.open });
}

export function setPanelOpen(open: boolean) {
  set({ ...state, open });
}

export function getDictionaryState(): State {
  return state;
}

export function useDictionaryState(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}'’-]/u;

/** The word at a text position, or the selected word when something is selected. Null when there is none. */
export function wordAt(text: string, start: number, end: number): string | null {
  if (end > start) {
    const picked = text.slice(start, end).trim();
    return picked && !/\s/.test(picked) && /[\p{L}\p{N}]/u.test(picked) ? picked.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") : null;
  }
  let a = start;
  let b = start;
  while (a > 0 && WORD_CHAR.test(text[a - 1])) a--;
  while (b < text.length && WORD_CHAR.test(text[b])) b++;
  const word = text.slice(a, b).replace(/^[-'’]+|[-'’]+$/g, "");
  return word && /[\p{L}\p{N}]/u.test(word) ? word : null;
}
