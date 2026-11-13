import { describe, expect, it } from "vitest";
import { formatEta, formatSpeed, percentOf, transferParts } from "./transfer";

describe("download description", () => {
  it("percent, bounded", () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(420, 1100)).toBe(38);
    expect(percentOf(2000, 1000)).toBe(100);
  });
  it("speed", () => {
    expect(formatSpeed(0)).toBe("");
    expect(formatSpeed(2_100_000)).toBe("2.1 MB/s");
    expect(formatSpeed(640_000)).toBe("640 kB/s");
  });
  it("time left", () => {
    expect(formatEta(0, 1_000_000, 0)).toBe("");
    expect(formatEta(0, 30_000_000, 1_000_000)).toBe("30 s");
    expect(formatEta(0, 600_000_000, 1_000_000)).toBe("10 min");
    expect(formatEta(0, 4_000_000_000, 1_000_000)).toBe("1 h 7 min");
    expect(formatEta(5, 5, 1_000_000)).toBe("");
  });
  it("all parts", () => {
    const p = transferParts(420_000_000, 1_130_000_000, 1_000_000);
    expect(p).toEqual({ percent: 37, sizes: "420 MB / 1.1 GB", speed: "1.0 MB/s", eta: "12 min" });
  });
});
