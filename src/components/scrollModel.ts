// The conversation view's scrolling: it follows new lines while the reader is at the bottom, stops following when the reader scrolls
// up, and offers "Jump to latest" with the count of lines that came in meanwhile. Pure, so it is tested without a window.

export interface ScrollState {
  // The view is at (or very near) the bottom: new lines scroll into sight by themselves.
  following: boolean;
  // Lines that arrived while the reader was away from the bottom.
  unseen: number;
}

export const initialScroll: ScrollState = { following: true, unseen: 0 };

/** Within this many pixels of the end counts as "at the bottom" (a fraction of a line, sub-pixel scrolling). */
export const BOTTOM_SLACK = 24;

export function atBottom(m: { scrollTop: number; clientHeight: number; scrollHeight: number }): boolean {
  return m.scrollHeight - (m.scrollTop + m.clientHeight) <= BOTTOM_SLACK;
}

/** The reader scrolled (or the view was resized): following resumes at the bottom and stops anywhere else. */
export function onScroll(state: ScrollState, bottom: boolean): ScrollState {
  return bottom ? { following: true, unseen: 0 } : { following: false, unseen: state.unseen };
}

/** `added` new lines arrived. Following: nothing to count. Away: they are counted for the button. */
export function onLines(state: ScrollState, added: number): ScrollState {
  return state.following ? state : { following: false, unseen: state.unseen + Math.max(0, added) };
}

/** "Jump to latest" was pressed. */
export function jump(): ScrollState {
  return initialScroll;
}

/** Show the button: only away from the bottom and only when something new came in. */
export function showJump(state: ScrollState): boolean {
  return !state.following && state.unseen > 0;
}

/** The scrollTop that shows the end. */
export function endOf(m: { clientHeight: number; scrollHeight: number }): number {
  return Math.max(0, m.scrollHeight - m.clientHeight);
}
