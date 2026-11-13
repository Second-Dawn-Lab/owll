// How a download is described: "37% · 420 MB / 1.1 GB · 2.1 MB/s · 5 min left".

import { formatBytes } from "./usePacks";

export function percentOf(done: number, total: number): number {
  return total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
}

/** "2.1 MB/s"; nothing while the speed is not known yet. */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 10_000) return "";
  const mb = bytesPerSecond / 1_000_000;
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${Math.round(bytesPerSecond / 1000)} kB/s`;
}

/** Seconds left as "45 s", "5 min" or "1 h 5 min"; nothing while it cannot be told. */
export function formatEta(done: number, total: number, bytesPerSecond: number): string {
  if (bytesPerSecond < 10_000 || total <= done) return "";
  const seconds = Math.ceil((total - done) / bytesPerSecond);
  if (seconds < 60) return `${Math.max(1, seconds)} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h} h ${minutes % 60} min`;
}

export interface TransferParts {
  percent: number;
  sizes: string;
  speed: string;
  eta: string;
}

export function transferParts(done: number, total: number, bytesPerSecond: number): TransferParts {
  return { percent: percentOf(done, total), sizes: total > 0 ? `${formatBytes(done)} / ${formatBytes(total)}` : "", speed: formatSpeed(bytesPerSecond), eta: formatEta(done, total, bytesPerSecond) };
}
