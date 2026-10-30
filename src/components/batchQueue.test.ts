import { describe, expect, it } from "vitest";
import type { DocDone, DocInfo } from "../ipc";
import { addPaths, busy, cancel, emptyBatch, failed, finished, inspectFailed, inspected, overall, pdfItems, progress, remove, setSource, sourceOf, start, startable, takeNext, type Batch } from "./batchQueue";

const info = (path: string, extra: Partial<DocInfo> = {}): DocInfo => ({ path, name: path.split("/").pop() ?? path, kind: "docx", sizeBytes: 100, detection: "ok", detected: "en", tooLarge: false, ...extra });
const done = (output: string): DocDone => ({ output, kind: "docx", units: 3, translated: 3, parts: null, skipped: [] });

function loaded(paths: string[], infos: Record<string, Partial<DocInfo>> = {}): Batch {
  let b = addPaths(emptyBatch, paths);
  for (const item of b.items) b = inspected(b, item.id, info(item.path, infos[item.path]));
  return b;
}

describe("adding files", () => {
  it("adds each file once, case-insensitively, and starts by inspecting it", () => {
    const b = addPaths(addPaths(emptyBatch, ["C:/a.docx", "C:/b.pdf"]), ["c:/A.DOCX", "C:/c.txt"]);
    expect(b.items.map((i) => i.name)).toEqual(["a.docx", "b.pdf", "c.txt"]);
    expect(b.items.every((i) => i.status === "inspecting")).toBe(true);
  });

  it("an inspected file is ready, a failed or too large one shows its error", () => {
    let b = addPaths(emptyBatch, ["/a.docx", "/b.docx", "/c.docx"]);
    b = inspected(b, 1, info("/a.docx"));
    b = inspectFailed(b, 2, { code: "encrypted", message: "" });
    b = inspected(b, 3, info("/c.docx", { tooLarge: true }));
    expect(b.items.map((i) => i.status)).toEqual(["ready", "error", "error"]);
    expect(b.items[1].error?.code).toBe("encrypted");
    expect(b.items[2].error?.code).toBe("too_large");
  });
});

describe("starting", () => {
  it("queues files that have a language and are not already in the target language", () => {
    const b = loaded(["/a.docx", "/b.docx", "/c.docx"], { "/b.docx": { detected: null, detection: "unsure" }, "/c.docx": { detected: "de" } });
    // b has no language, c is already German
    expect(startable(b, "de").map((i) => i.name)).toEqual(["a.docx"]);
    const chosen = setSource(b, 2, "fr");
    // an override gives the language
    expect(startable(chosen, "de").map((i) => i.name)).toEqual(["a.docx", "b.docx"]);
    expect(sourceOf(chosen.items[1])).toBe("fr");
  });

  it("runs the files one after another, in the order of the list", () => {
    let b = start(loaded(["/a.docx", "/b.docx", "/c.docx"]), "de");
    const order: string[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const next = takeNext(b);
      b = next.batch;
      if (!next.item) break;
      order.push(next.item.name);
      // While one is translating, no second one starts.
      expect(takeNext(b).item).toBeNull();
      b = finished(b, done(`/out/${next.item.name}`));
    }
    expect(order).toEqual(["a.docx", "b.docx", "c.docx"]);
    expect(b.running).toBe(false);
    expect(b.items.every((i) => i.status === "done")).toBe(true);
  });

  it("a failing file does not stop the others", () => {
    let b = start(loaded(["/a.docx", "/b.docx"]), "de");
    let next = takeNext(b);
    b = failed(next.batch, { code: "corrupt", message: "bad" });
    next = takeNext(b);
    expect(next.item?.name).toBe("b.docx");
    b = finished(next.batch, done("/out/b.docx"));
    expect(b.items.map((i) => i.status)).toEqual(["error", "done"]);
  });
});

describe("cancelling and removing", () => {
  it("cancelling the batch returns waiting files to ready and stops the batch; the running file goes back to ready when the backend reports the cancel", () => {
    let b = start(loaded(["/a.docx", "/b.docx", "/c.docx"]), "de");
    b = takeNext(b).batch;
    b = progress(b, 3, 10);
    b = cancel(b);
    expect(b.running).toBe(false);
    expect(b.items.map((i) => i.status)).toEqual(["translating", "ready", "ready"]);
    expect(takeNext(b).item).toBeNull();
    b = failed(b, { code: "cancelled", message: "cancelled" });
    expect(b.items.map((i) => i.status)).toEqual(["ready", "ready", "ready"]);
    expect(b.items[0]).toMatchObject({ done: 0, total: 0 });
    expect(busy(b)).toBe(false);
  });

  it("a file in progress cannot be removed, any other can", () => {
    let b = start(loaded(["/a.docx", "/b.docx"]), "de");
    b = takeNext(b).batch;
    expect(remove(b, 1).items).toHaveLength(2);
    expect(remove(b, 2).items.map((i) => i.name)).toEqual(["a.docx"]);
  });

  it("the language cannot be changed once a file is being translated or finished", () => {
    let b = start(loaded(["/a.docx"]), "de");
    b = takeNext(b).batch;
    expect(setSource(b, 1, "fr").items[0].source).toBe("auto");
  });
});

describe("progress", () => {
  it("counts finished files plus the part of the current one", () => {
    let b = start(loaded(["/a.docx", "/b.docx", "/c.docx", "/d.docx"]), "de");
    b = takeNext(b).batch;
    b = finished(b, done("/o/a"));
    b = takeNext(b).batch;
    b = progress(b, 5, 10);
    const o = overall(b);
    expect(o).toMatchObject({ done: 1, total: 4 });
    expect(o.fraction).toBeCloseTo(1.5 / 4);
  });

  it("finds the PDFs, which need the output question", () => {
    const b = loaded(["/a.docx", "/b.pdf", "/c.PDF"], { "/b.pdf": { kind: "pdf" }, "/c.PDF": { kind: "pdf" } });
    expect(pdfItems(b.items).map((i) => i.name)).toEqual(["b.pdf", "c.PDF"]);
  });
});
