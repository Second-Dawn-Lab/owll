// What the result pane shows once the model has rewritten the fast translation.

export interface RewriteInfo {
  text: string;
  /** Sentences the model's answer was not used for (the fast translation stays there). */
  kept: number;
  /** All sentences of the text. */
  sentences: number;
}

export interface RewriteView {
  // A rewrite exists: the "Fast version" toggle is offered.
  hasRewrite: boolean;
  // The rewrite is shown (the "Polished" marker, its glossary highlight).
  polished: boolean;
  // A rewrite exists but the user asked for the fast translation.
  fastShown: boolean;
}

/**
 * A rewrite counts when the model's answer was used for at least one sentence, also when it came out the same as the fast
 * translation: a sentence with a glossary term is often already right ("Die Eulen jagen ...") and is still polished, with its
 * marker, its toggle and its glossary highlight.
 */
export function rewriteView(rewrite: RewriteInfo | null, showFast: boolean): RewriteView {
  const hasRewrite = !!rewrite && rewrite.kept < Math.max(1, rewrite.sentences);
  return { hasRewrite, polished: hasRewrite && !showFast, fastShown: hasRewrite && showFast };
}
