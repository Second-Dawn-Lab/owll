// Swapping the two panes: the languages, the text and everything derived from it flip together.

export interface SwapInput {
  /** The chosen languages (the source may be "auto"). */
  from: string;
  to: string;
  /** What the translator really used. */
  status: string;
  detected: string | null;
  resolvedFrom: string | null;
  effectiveTo: string | null;
  /** The result shown (the polished one when Quality mode made it) and whether it belongs to the current text. */
  result: string;
  fresh: boolean;
  /** The text in the source pane. */
  input: string;
}

export interface SwapPlan {
  source: string;
  target: string;
  text: string;
}

/**
 * The new source language is the language the result is really in, the new target the language the text really was in
 * (not only what the pickers said: a same-language request is translated to a smart target, and "auto" was detected),
 * and the new text is the result as it is shown. Null when the language of the text is not known.
 */
export function swapPlan(i: SwapInput): SwapPlan | null {
  const done = i.status === "done";
  const actualFrom = done && i.resolvedFrom ? i.resolvedFrom : i.from !== "auto" ? i.from : i.detected;
  const actualTo = done && i.effectiveTo ? i.effectiveTo : i.to;
  if (!actualFrom) return null;
  const useResult = done && i.fresh && i.result.trim().length > 0;
  return { source: actualTo, target: actualFrom, text: useResult ? i.result : i.input };
}
