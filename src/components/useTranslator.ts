import { useCallback, useEffect, useRef, useState } from "react";
import { applyPick } from "./resultWords";
import type { GlossaryTerm, SegmentInfo } from "../ipc";
import { ipc, IpcError } from "../ipc";
import { rewriteView } from "./rewriteView";
import { effectiveTone, type Tone } from "./toneLanguages";
import { trace } from "../trace";

/**
 * "undetected": the language could not be told; "unavailable": it was detected but its pack is
 * not installed or not active (see `detected`).
 */
export type Status = "idle" | "translating" | "done" | "error" | "undetected" | "unavailable";

export interface TranslatorState {
  status: Status;
  result: string;
  /** `result` belongs to the current request (not a leftover of the previous one). */
  fresh: boolean;
  /** A complete draft is showing and the final pass is quietly replacing it. */
  refining: boolean;
  /** Language guessed when the source is "auto". */
  detected: string | null;
  /** The language actually used as the source. */
  resolvedFrom: string | null;
  /** The target actually used: differs from the chosen one when source and target were the same. */
  effectiveTo: string | null;
  /** The text went through English (from -> en -> to). */
  pivoted: boolean;
  error: IpcError | null;
  /** The translated sentences of a finished translation, for word alternatives. */
  segments: SegmentInfo[];
  /** Glossary terms that were put into the result. */
  glossaryHits: number;
  /** Where they stand in the result (highlighted, with a tooltip). */
  glossaryTerms: GlossaryTerm[];
  /** Quality mode: "running" while the model rewrites the sentences, "done" when all are through (some may be kept). */
  polish: "off" | "running" | "done" | "failed";
  /** Sentences the model changed so far. */
  polishedCount: number;
  /** Why Quality mode could not polish (a short sentence), when it failed. */
  polishError: string | null;
  /** The code of that failure ("quality_low_memory", ...). */
  polishErrorCode: string | null;
}

/** The state plus what the result pane can do with it. */
export type Translator = TranslatorState & {
  /** The user picked an alternative for sentence `segment`: show it (the backend remembers the choice). */
  pick: (segment: number, sentence: string) => void;
  /** The result shown is the model's rewrite (and the fast translation is one toggle away). */
  polished: boolean;
  /** A rewrite exists but the fast translation is shown (the user asked for it). */
  fastShown: boolean;
  /** Polish the sentences again (after a failure). */
  retryPolish: () => void;
};

export interface TranslatorOptions {
  /** Wait this long after the text changed before translating. */
  debounceMs?: number;
  /** Can this language be translated right now (installed and active)? Default: all. */
  isUsable?: (code: string) => boolean;
  /** Source and target were the same: this target was used instead. */
  onTargetChange?: (target: string) => void;
  /** A new value forgets everything shown (the languages were swapped: nothing of the old result may stay on screen). */
  resetKey?: number;
  /** Quality mode: rewrite the finished translation with the local model, sentence by sentence. */
  polish?: { enabled: boolean; tone: Tone; showFast: boolean };
}

const DEBOUNCE_MS = 300;

const IDLE: TranslatorState = {
  status: "idle",
  result: "",
  fresh: false,
  refining: false,
  detected: null,
  resolvedFrom: null,
  effectiveTo: null,
  pivoted: false,
  error: null,
  segments: [],
  glossaryHits: 0,
  glossaryTerms: [],
  polish: "off",
  polishedCount: 0,
  polishError: null,
  polishErrorCode: null,
};

let nextRequestId = 1;
/** The model's rewrite starts this long after the fast translation is complete (the text has stopped changing). */
const POLISH_DELAY_MS = 500;

/**
 * Debounced live translation. The backend streams: a first pass with a quick draft that fills
 * in sentence by sentence, then a second pass that replaces the draft without any fuss.
 * A newer request makes the backend drop the older one.
 * TODO (later): word alternatives plug in here.
 */
export function useTranslator(text: string, from: string, to: string, epoch: number, options: TranslatorOptions = {}): Translator {
  const { debounceMs = DEBOUNCE_MS } = options;
  const [state, setState] = useState<TranslatorState>(IDLE);
  /** The request whose progress events are accepted; 0 when none. */
  const active = useRef(0);
  const firstShown = useRef(false);
  // Read at request time, so a new function every render does not restart the translation.
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => {
    const unlisten = ipc.onTranslateProgress((p) => {
      if (p.requestId !== active.current) return;
      if (!firstShown.current && p.text) {
        firstShown.current = true;
        trace(`first sentences arrived (${p.done}/${p.total}, ${p.pass} pass)`);
      }
      const complete = p.done === p.total;
      // Text that fills in front of the user (a first pass, or a single pass) is "translating";
      // once a complete draft is showing, the second pass replaces it quietly ("refining").
      const quiet = p.draftShown || (p.pass === "fast" && complete);
      setState((s) => ({
        ...s,
        status: quiet || complete ? "done" : "translating",
        result: p.text,
        fresh: true,
        refining: quiet && !(p.pass === "refine" && complete),
        pivoted: p.pivoted,
        error: null,
        segments: [],
        glossaryHits: 0,
        glossaryTerms: [],
        polish: "off",
        polishedCount: 0,
        polishError: null,
        polishErrorCode: null,
      }));
    });
    return () => void unlisten.then((fn) => fn());
  }, []);

  // Swapping the languages: the old result, sentences, alternatives and rewrite belong to the old direction.
  const resetKey = options.resetKey ?? 0;
  useEffect(() => {
    active.current = 0;
    setState(IDLE);
  }, [resetKey]);

  useEffect(() => {
    if (!text.trim()) {
      active.current = 0;
      setState(IDLE);
      return;
    }
    // Keep the previous result visible (dimmed) until the first new sentences arrive.
    setState((s) => ({ ...s, status: "translating", fresh: false, refining: false, error: null }));

    let cancelled = false;
    const run = async () => {
      let detected: string | null = null;
      let source = from;
      let target = to;
      const id = nextRequestId++;
      active.current = id;
      firstShown.current = false;
      trace(`request #${id} starts (${text.length} chars)`);
      try {
        if (from === "auto") {
          const found = await ipc.detectLanguage(text);
          trace(`detect_language returned ${found.status} ${found.code ?? ""}`);
          if (cancelled) return;
          if (found.status !== "ok" || !found.code) {
            // No letters: nothing to do. Too little to go on: ask instead of guessing.
            setState({ ...IDLE, status: found.status === "none" ? "idle" : "undetected" });
            return;
          }
          detected = found.code;
          source = detected;
          if (opts.current.isUsable && !opts.current.isUsable(source)) {
            setState({ ...IDLE, status: "unavailable", detected, resolvedFrom: source });
            return;
          }
          setState((s) => ({ ...s, detected, resolvedFrom: source }));
        }
        if (source === target) {
          target = await ipc.smartTarget(source, target);
          if (cancelled) return;
          if (target !== to) opts.current.onTargetChange?.(target);
        }
        const out = await ipc.translate(id, text, source, target);
        trace(`translate #${id} returned (${out.text.length} chars, superseded: ${cancelled})`);
        if (!cancelled) {
          setState({ status: "done", result: out.text, fresh: true, refining: false, detected, resolvedFrom: source, effectiveTo: target, pivoted: out.pivoted, error: null, segments: out.segments ?? [], glossaryHits: out.glossaryHits ?? 0, glossaryTerms: out.glossaryTerms ?? [], polish: "off", polishedCount: 0, polishError: null, polishErrorCode: null });
        }
      } catch (e) {
        const error = e instanceof IpcError ? e : new IpcError("unknown", String(e));
        // A newer request replaced this one in the backend; the newer result is on its way.
        if (!cancelled && error.code !== "cancelled") {
          setState({ status: "error", result: "", fresh: false, refining: false, detected, resolvedFrom: source, effectiveTo: target, pivoted: false, error, segments: [], glossaryHits: 0, glossaryTerms: [], polish: "off", polishedCount: 0, polishError: null, polishErrorCode: null });
        }
      }
    };

    // No waiting when the text arrives complete (quick access); typing is debounced.
    const timer = debounceMs > 0 ? setTimeout(() => void run(), debounceMs) : undefined;
    if (!timer) void run();

    return () => {
      cancelled = true;
      active.current = 0;
      clearTimeout(timer);
    };
  }, [text, from, to, epoch, debounceMs]);

  // Quality mode: once the fast translation is complete and has rested, the model rewrites it sentence by sentence.
  // What it makes is kept apart (`rewrite`), so the fast version stays one toggle away.
  const [rewrite, setRewrite] = useState<{ text: string; segments: SegmentInfo[]; terms: GlossaryTerm[]; kept: number } | null>(null);
  const polishId = useRef(0);
  const polishOn = !!options.polish?.enabled;
  const polishTone = options.polish?.tone ?? "automatic";
  const showFast = !!options.polish?.showFast;
  const settled = state.status === "done" && !state.refining && state.fresh && !!state.result.trim();
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const unlisten = ipc.onPolishProgress((p) => {
      if (p.requestId !== polishId.current) return;
      setRewrite({ text: p.text, segments: p.segments, terms: p.glossaryTerms, kept: 0 });
      setState((s) => ({ ...s, polish: p.done === p.total ? "done" : "running", polishedCount: p.polished }));
    });
    return () => void unlisten.then((fn) => fn());
  }, []);

  useEffect(() => {
    // A new fast translation (or Quality mode switched off) drops the old rewrite and stops the model's work on it.
    if (polishId.current !== 0) void ipc.qualityPolishCancel();
    polishId.current = 0;
    setRewrite(null);
    if (!polishOn || !settled || !resolvedTarget(state, to)) return;
    const timer = setTimeout(() => {
      const id = nextRequestId++;
      polishId.current = id;
      const source = state.resolvedFrom ?? from;
      const target = state.effectiveTo ?? to;
      // Without sentence data (nothing to pick from) the whole text is one sentence.
      const segments: SegmentInfo[] = state.segments.length > 0 ? state.segments : [{ source: text, input: text, target: state.result, start: 0, end: utf16Length(state.result), pinned: false }];
      setState((s) => ({ ...s, polish: "running", polishedCount: 0, polishError: null, polishErrorCode: null }));
      trace(`polish #${id} starts (${segments.length} sentences)`);
      ipc
        .qualityPolish(id, state.result, source, target, segments, effectiveTone(target, polishTone))
        .then((out) => {
          if (polishId.current !== id) return;
          setRewrite({ text: out.text, segments: out.segments, terms: out.glossaryTerms, kept: out.kept });
          setState((s) => ({ ...s, polish: "done", polishedCount: out.polished }));
        })
        .catch((e) => {
          if (polishId.current !== id) return;
          const error = e instanceof IpcError ? e : new IpcError("unknown", String(e));
          if (error.code === "cancelled") return;
          // The fast translation stays; the reason is shown in a quiet note.
          setState((s) => ({ ...s, polish: "failed", polishError: error.message, polishErrorCode: error.code }));
        });
    }, POLISH_DELAY_MS);
    return () => clearTimeout(timer);
    // `state` changes with every pick; the effect is keyed by what a rewrite depends on.
  }, [settled, state.result, polishOn, polishTone, text, from, to, retry]);

  // The rewrite counts when the model's answer was used, also when it came out the same as the fast translation.
  const { hasRewrite, polished } = rewriteView(rewrite ? { text: rewrite.text, kept: rewrite.kept, sentences: rewrite.segments.length } : null, showFast);
  const retryPolish = useCallback(() => setRetry((n) => n + 1), []);

  const pick = useCallback(
    (segment: number, sentence: string) => {
      if (polished && rewrite) {
        const out = applyPick(rewrite.text, rewrite.segments, segment, sentence, rewrite.terms);
        setRewrite({ text: out.text, segments: out.segments, terms: out.terms, kept: rewrite.kept });
        return;
      }
      setState((s) => {
        const out = applyPick(s.result, s.segments, segment, sentence, s.glossaryTerms);
        return { ...s, result: out.text, segments: out.segments, glossaryTerms: out.terms, glossaryHits: out.terms.length };
      });
    },
    [polished, rewrite],
  );

  if (polished && rewrite) {
    return { ...state, result: rewrite.text, segments: rewrite.segments, glossaryTerms: rewrite.terms, glossaryHits: rewrite.terms.length, pick, polished: true, fastShown: false, retryPolish };
  }
  return { ...state, pick, polished: false, fastShown: hasRewrite && showFast, retryPolish };
}

const resolvedTarget = (state: TranslatorState, to: string) => (state.effectiveTo ?? to) !== (state.resolvedFrom ?? "");

const utf16Length = (s: string) => s.length;
