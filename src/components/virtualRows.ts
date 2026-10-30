// Which rows of a long list to draw. Rows have different heights (a long paragraph is taller), which are measured as
// rows are drawn; rows not measured yet count with an estimate. Pure functions, so the window math is tested.

export interface RowRange {
  /** First and one past the last row to draw. */
  start: number;
  end: number;
  /** Space above the first drawn row and below the last one. */
  before: number;
  after: number;
  total: number;
}

/**
 * `heights[i]` is the measured height of row `i` or 0 when it is not measured (`estimate` stands in). The rows
 * that touch the window [scrollTop, scrollTop + viewport] are drawn, plus `overscan` rows on both sides.
 */
export function rowRange(heights: ArrayLike<number>, count: number, estimate: number, scrollTop: number, viewport: number, overscan = 4): RowRange {
  const h = (i: number) => heights[i] || estimate;
  let total = 0;
  let first = -1;
  let last = -1;
  const top = Math.max(0, scrollTop);
  const bottom = top + viewport;
  const offsets = new Float64Array(count + 1);
  for (let i = 0; i < count; i++) {
    offsets[i] = total;
    total += h(i);
    if (first < 0 && total > top) first = i;
    if (offsets[i] < bottom) last = i;
  }
  offsets[count] = total;
  if (count === 0) return { start: 0, end: 0, before: 0, after: 0, total: 0 };
  if (first < 0) first = count - 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, Math.max(last, first) + 1 + overscan);
  return { start, end, before: offsets[start], after: total - offsets[end], total };
}

/** The scroll position that puts row `index` at the top. */
export function offsetOf(heights: ArrayLike<number>, index: number, estimate: number): number {
  let sum = 0;
  for (let i = 0; i < index; i++) sum += heights[i] || estimate;
  return sum;
}
