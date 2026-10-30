// The Files tab's batch: several documents translated one after another. Pure functions on a plain state,
// so the order, cancelling and removing are tested without the app.

import type { DocDone, DocInfo } from "../ipc";

export type ItemStatus = "inspecting" | "ready" | "waiting" | "translating" | "done" | "error";

export interface BatchItem {
  id: number;
  path: string;
  name: string;
  kind: DocInfo["kind"] | null;
  sizeBytes: number;
  /** The language found in the text, if any. */
  detected: string | null;
  /** "auto" uses `detected`; anything else is the language the user chose for this file. */
  source: string;
  status: ItemStatus;
  done: number;
  total: number;
  output: string | null;
  result: DocDone | null;
  /** A failure: its code (from the backend) and message. */
  error: { code: string; message: string } | null;
}

export interface Batch {
  items: BatchItem[];
  nextId: number;
  /** Running: the next waiting item starts when the current one ends. */
  running: boolean;
}

export const emptyBatch: Batch = { items: [], nextId: 1, running: false };

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Add files (a file that is already in the list is not added twice). */
export function addPaths(batch: Batch, paths: string[]): Batch {
  const known = new Set(batch.items.map((i) => i.path.toLowerCase()));
  let nextId = batch.nextId;
  const added: BatchItem[] = [];
  for (const path of paths) {
    if (known.has(path.toLowerCase())) continue;
    known.add(path.toLowerCase());
    added.push({ id: nextId++, path, name: fileName(path), kind: null, sizeBytes: 0, detected: null, source: "auto", status: "inspecting", done: 0, total: 0, output: null, result: null, error: null });
  }
  return { ...batch, items: [...batch.items, ...added], nextId };
}

const update = (batch: Batch, id: number, change: (item: BatchItem) => BatchItem): Batch => ({ ...batch, items: batch.items.map((i) => (i.id === id ? change(i) : i)) });

export function inspected(batch: Batch, id: number, info: DocInfo): Batch {
  return update(batch, id, (i) => ({
    ...i,
    kind: info.kind,
    sizeBytes: info.sizeBytes,
    detected: info.detected,
    name: info.name || i.name,
    status: info.tooLarge ? "error" : "ready",
    error: info.tooLarge ? { code: "too_large", message: "" } : null,
  }));
}

export function inspectFailed(batch: Batch, id: number, error: { code: string; message: string }): Batch {
  return update(batch, id, (i) => ({ ...i, status: "error", error }));
}

export function setSource(batch: Batch, id: number, source: string): Batch {
  return update(batch, id, (i) => (i.status === "ready" || i.status === "waiting" ? { ...i, source } : i));
}

/** Remove a file from the list. A file that is being translated stays (cancel the batch to stop it). */
export function remove(batch: Batch, id: number): Batch {
  return { ...batch, items: batch.items.filter((i) => i.id !== id || i.status === "translating") };
}

/** The language a file is translated from: the one chosen, else the detected one. */
export function sourceOf(item: BatchItem): string | null {
  return item.source !== "auto" ? item.source : item.detected;
}

/** Files that can be started: they have a language and nothing went wrong. */
export function startable(batch: Batch, target: string): BatchItem[] {
  return batch.items.filter((i) => i.status === "ready" && sourceOf(i) !== null && sourceOf(i) !== target);
}

/** Queue every startable file; the first one is taken by `takeNext`. */
export function start(batch: Batch, target: string): Batch {
  const ids = new Set(startable(batch, target).map((i) => i.id));
  if (ids.size === 0) return batch;
  return { ...batch, running: true, items: batch.items.map((i) => (ids.has(i.id) ? { ...i, status: "waiting", done: 0, total: 0, error: null } : i)) };
}

/** The next file to translate, if the batch is running and none is translating. */
export function takeNext(batch: Batch): { batch: Batch; item: BatchItem | null } {
  if (!batch.running || batch.items.some((i) => i.status === "translating")) return { batch, item: null };
  const item = batch.items.find((i) => i.status === "waiting") ?? null;
  if (!item) return { batch: { ...batch, running: false }, item: null };
  return { batch: update(batch, item.id, (i) => ({ ...i, status: "translating" })), item: { ...item, status: "translating" } };
}

export function progress(batch: Batch, done: number, total: number): Batch {
  const current = batch.items.find((i) => i.status === "translating");
  return current ? update(batch, current.id, (i) => ({ ...i, done, total })) : batch;
}

export function finished(batch: Batch, result: DocDone): Batch {
  const current = batch.items.find((i) => i.status === "translating");
  return current ? update(batch, current.id, (i) => ({ ...i, status: "done", output: result.output, result, done: i.total })) : batch;
}

/** The current file failed (a cancel is not a failure of the file: it goes back to "ready"). */
export function failed(batch: Batch, error: { code: string; message: string }): Batch {
  const current = batch.items.find((i) => i.status === "translating");
  if (!current) return batch;
  if (error.code === "cancelled") return update(batch, current.id, (i) => ({ ...i, status: "ready", done: 0, total: 0 }));
  return update(batch, current.id, (i) => ({ ...i, status: "error", error }));
}

/** Stop the whole batch: waiting files go back to "ready"; the one in progress is stopped by the backend. */
export function cancel(batch: Batch): Batch {
  return { ...batch, running: false, items: batch.items.map((i) => (i.status === "waiting" ? { ...i, status: "ready" } : i)) };
}

/** The batch is busy: something is waiting or translating. */
export function busy(batch: Batch): boolean {
  return batch.items.some((i) => i.status === "waiting" || i.status === "translating");
}

/** Overall progress for the header: finished files plus the fraction of the current one. */
export function overall(batch: Batch): { done: number; total: number; fraction: number } {
  const inBatch = batch.items.filter((i) => i.status === "waiting" || i.status === "translating" || i.status === "done");
  const finishedCount = inBatch.filter((i) => i.status === "done").length;
  const current = batch.items.find((i) => i.status === "translating");
  const part = current && current.total > 0 ? current.done / current.total : 0;
  const total = inBatch.length;
  return { done: finishedCount, total, fraction: total === 0 ? 0 : (finishedCount + part) / total };
}

/** Whether the batch has PDFs, which need the question "keep as PDF or convert to Word?". */
export function pdfItems(items: BatchItem[]): BatchItem[] {
  return items.filter((i) => i.kind === "pdf");
}
