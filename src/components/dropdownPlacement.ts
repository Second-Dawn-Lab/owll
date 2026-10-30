// Where a dropdown (the language list) opens so that it stays inside its window.
//
// The quick popup can be as small as 320 x 180, far smaller than the list, and a window clips
// everything outside it. So the list is shifted sideways to fit, opens upwards when there is more
// room above, and gets a smaller scrolling area when neither side has enough room.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DropdownInput {
  /** The button that opens the dropdown, in viewport coordinates. */
  trigger: Box;
  viewport: { width: number; height: number };
  /** Preferred width of the dropdown. */
  width: number;
  /** Height of the dropdown outside its scrolling list (the search field). */
  chromeHeight: number;
  /** Height the list would like to have. */
  listHeight: number;
  /** Space kept free at the window edges. */
  margin?: number;
  /** Space between the trigger and the dropdown. */
  gap?: number;
}

export interface DropdownPlacement {
  /** Width to use (smaller than asked when the window is narrow). */
  width: number;
  /** Move the (centered) dropdown by this many pixels, negative = left. */
  shiftX: number;
  /** Open above the trigger instead of below. */
  flipUp: boolean;
  /** Height of the scrolling list. */
  listMaxHeight: number;
}

/** The list never gets smaller than about two rows, so it stays usable. */
export const MIN_LIST_HEIGHT = 56;

export function placeDropdown(input: DropdownInput): DropdownPlacement {
  const { trigger, viewport, chromeHeight, listHeight, margin = 8, gap = 6 } = input;
  const width = Math.max(120, Math.min(input.width, viewport.width - 2 * margin));

  const ideal = (trigger.left + trigger.right) / 2 - width / 2;
  const left = Math.min(Math.max(ideal, margin), Math.max(margin, viewport.width - margin - width));

  const below = viewport.height - trigger.bottom - gap - margin;
  const above = trigger.top - gap - margin;
  const wanted = chromeHeight + listHeight;
  const flipUp = wanted > below && above > below;
  const room = flipUp ? above : below;

  return {
    width,
    shiftX: left - ideal,
    flipUp,
    listMaxHeight: Math.max(MIN_LIST_HEIGHT, Math.min(listHeight, room - chromeHeight)),
  };
}
