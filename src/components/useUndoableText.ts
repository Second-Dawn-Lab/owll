import { useCallback, useState } from "react";

interface State {
  past: string[];
  present: string;
  future: string[];
  changedAt: number;
}

/** A pause longer than this starts a new undo step while typing. */
const STEP_MS = 700;

/** Text state with undo/redo. Typing is grouped into steps; `checkpoint` forces a new step. */
export function useUndoableText(initial = "") {
  const [state, setState] = useState<State>({ past: [], present: initial, future: [], changedAt: 0 });

  const set = useCallback((value: string, checkpoint = false) => {
    setState((s) => {
      if (value === s.present) return s;
      const now = Date.now();
      const newStep = checkpoint || now - s.changedAt > STEP_MS;
      return {
        past: newStep ? [...s.past, s.present].slice(-100) : s.past,
        present: value,
        future: [],
        changedAt: now,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) =>
      s.past.length === 0
        ? s
        : {
            past: s.past.slice(0, -1),
            present: s.past[s.past.length - 1],
            future: [s.present, ...s.future],
            changedAt: 0,
          },
    );
  }, []);

  const redo = useCallback(() => {
    setState((s) =>
      s.future.length === 0
        ? s
        : {
            past: [...s.past, s.present],
            present: s.future[0],
            future: s.future.slice(1),
            changedAt: 0,
          },
    );
  }, []);

  return {
    text: state.present,
    set,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
