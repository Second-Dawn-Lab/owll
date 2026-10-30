import { describe, expect, it } from "vitest";
import { MIN_LIST_HEIGHT, placeDropdown, type Box } from "./dropdownPlacement";

const box = (left: number, top: number, width = 120, height = 30): Box => ({ left, top, right: left + width, bottom: top + height });
const base = { width: 300, chromeHeight: 44, listHeight: 320 };

describe("placeDropdown", () => {
  it("opens below a trigger in a large window, unchanged", () => {
    const p = placeDropdown({ ...base, trigger: box(400, 20), viewport: { width: 1000, height: 700 } });
    expect(p).toEqual({ width: 300, shiftX: 0, flipUp: false, listMaxHeight: 320 });
  });

  it("shrinks the list to the room below in the smallest quick popup (320 x 180)", () => {
    const viewport = { width: 320, height: 180 };
    const trigger = box(8, 6, 110, 30);
    const p = placeDropdown({ ...base, trigger, viewport });
    expect(p.flipUp).toBe(false);
    // The whole dropdown ends inside the window, with the margin kept.
    const bottom = trigger.bottom + 6 + base.chromeHeight + p.listMaxHeight;
    expect(bottom).toBeLessThanOrEqual(viewport.height - 8);
    expect(p.listMaxHeight).toBeGreaterThanOrEqual(MIN_LIST_HEIGHT);
  });

  it("shifts a centered dropdown that would stick out on the left or right", () => {
    const viewport = { width: 320, height: 400 };
    const left = placeDropdown({ ...base, trigger: box(0, 10, 60), viewport });
    expect(left.shiftX).toBeGreaterThan(0);
    // centered under the trigger (x 30) a 300 px wide dropdown starts at -120; shifted it starts at the margin
    expect(30 - 150 + left.shiftX).toBe(8);

    const right = placeDropdown({ ...base, trigger: box(260, 10, 60), viewport });
    expect(right.shiftX).toBeLessThan(0);
    expect(290 - 150 + right.shiftX + 300).toBe(320 - 8);
  });

  it("is narrower than asked when the window is narrower than the dropdown", () => {
    const p = placeDropdown({ ...base, trigger: box(10, 10), viewport: { width: 280, height: 400 } });
    expect(p.width).toBe(264);
    expect(70 - 132 + p.shiftX).toBe(8);
  });

  it("opens upwards when there is clearly more room above", () => {
    const p = placeDropdown({ ...base, trigger: box(100, 560), viewport: { width: 1000, height: 640 } });
    expect(p.flipUp).toBe(true);
    expect(p.listMaxHeight).toBe(320);
  });

  it("stays below when it fits there, even if there is more room above", () => {
    const p = placeDropdown({ ...base, trigger: box(100, 300), viewport: { width: 1000, height: 900 }, listHeight: 200 });
    expect(p.flipUp).toBe(false);
  });

  it("never makes the list unusably small", () => {
    const p = placeDropdown({ ...base, trigger: box(0, 100), viewport: { width: 320, height: 150 } });
    expect(p.listMaxHeight).toBe(MIN_LIST_HEIGHT);
  });
});
