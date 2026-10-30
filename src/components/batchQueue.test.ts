import { describe, expect, it } from "vitest";
import type { DocDone, DocInfo, EditTranslated } from "../ipc";
import { addPaths, busy, cancel, clear, editTranslated, emptyBatch, failed, finished, inspectFailed, inspected, overall, pdfItems, progress, remove, setSource, skipReason, sourceOf, start, startable, startState, takeNext, type Batch } from "./batchQueue";

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

describe("a batch of English files translated into German", () => {
  it("runs all three, one after another, and a batch of three starts three", () => {
    let b = loaded(["/1.docx", "/2.xlsx", "/3.pptx"], { "/2.xlsx": { kind: "xlsx" }, "/3.pptx": { kind: "pptx" } });
    expect(startState(b, "de")).toEqual({ count: 3, disabledReason: null });
    b = start(b, "de");
    const order: string[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const next = takeNext(b);
      b = next.batch;
      if (!next.item) break;
      order.push(next.item.name);
      b = finished(b, done(`/out/${next.item.name}`));
    }
    expect(order).toEqual(["1.docx", "2.xlsx", "3.pptx"]);
    expect(b.items.map((i) => i.status)).toEqual(["done", "done", "done"]);
  });

  it("German files into English all run (the target is not changed by the files' language)", () => {
    const b = loaded(["/a.docx", "/b.docx", "/c.docx"], { "/a.docx": { detected: "de" }, "/b.docx": { detected: "de" }, "/c.docx": { detected: "de" } });
    expect(startState(b, "en")).toEqual({ count: 3, disabledReason: null });
    expect(startState(b, "de")).toEqual({ count: 0, disabledReason: "all-same-language" });
  });
});

describe("skipped files and the main button", () => {
  const mixed = () => loaded(["/en.docx", "/de1.docx", "/de2.docx", "/x.docx"], { "/de1.docx": { detected: "de" }, "/de2.docx": { detected: "de" }, "/x.docx": { detected: null, detection: "unsure" } });

  it("a file already in the target language is skipped with that reason; one without a language says so", () => {
    const b = mixed();
    expect(b.items.map((i) => skipReason(i, "de"))).toEqual([null, "same-language", "same-language", "no-language"]);
    expect(startable(b, "de").map((i) => i.name)).toEqual(["en.docx"]);
  });

  it("the button counts only the files that will run", () => {
    expect(startState(mixed(), "de")).toEqual({ count: 1, disabledReason: null });
  });

  it("choosing another source language for a skipped file makes it run (translate anyway)", () => {
    const b = setSource(mixed(), 2, "fr");
    expect(skipReason(b.items[1], "de")).toBeNull();
    expect(skipReason(b.items[2], "de")).toBe("same-language");
    expect(startState(b, "de").count).toBe(2);
  });

  it("is disabled with a reason, never 'Translate 0 documents'", () => {
    expect(startState(emptyBatch, "de")).toEqual({ count: 0, disabledReason: "empty" });
    expect(startState(addPaths(emptyBatch, ["/a.docx"]), "de")).toEqual({ count: 0, disabledReason: "inspecting" });
    expect(startState(loaded(["/a.docx"], { "/a.docx": { detected: "de" } }), "de")).toEqual({ count: 0, disabledReason: "all-same-language" });
    expect(startState(loaded(["/a.docx"], { "/a.docx": { detected: null } }), "de")).toEqual({ count: 0, disabledReason: "no-language" });
    let b = start(loaded(["/a.docx"]), "de");
    b = finished(takeNext(b).batch, done("/o"));
    expect(startState(b, "de")).toEqual({ count: 0, disabledReason: "nothing-ready" });
  });
});

describe("clearing the list", () => {
  it("keeps counting ids so a new file is never mistaken for an old one", () => {
    const b = loaded(["/a.docx", "/b.docx"]);
    const cleared = clear(b);
    expect(cleared.items).toEqual([]);
    const again = addPaths(cleared, ["/c.docx"]);
    expect(again.items[0].id).toBeGreaterThan(Math.max(...b.items.map((i) => i.id)));
  });
});

describe("translating for editing", () => {
  const translated = (draftId: string): EditTranslated => ({ draftId, path: "/a.docx", kind: "docx", units: 4, skipped: [] });

  it("each finished file keeps its draft for the Edit button and no output file", () => {
    let b = start(loaded(["/a.docx", "/b.docx"]), "de", true);
    expect(b.edit).toBe(true);
    expect(b.started).toBe(2);
    b = takeNext(b).batch;
    b = editTranslated(b, translated("d1"));
    expect(b.items[0]).toMatchObject({ status: "done", draftId: "d1", output: null });
    b = takeNext(b).batch;
    b = editTranslated(b, translated("d2"));
    expect(b.items.map((i) => i.draftId)).toEqual(["d1", "d2"]);
    expect(busy(b)).toBe(false);
  });

  it("a plain run is not an edit run, and starting again forgets old drafts", () => {
    expect(start(loaded(["/a.docx"]), "de").edit).toBe(false);
    let b = start(loaded(["/a.docx"]), "de", true);
    b = editTranslated(takeNext(b).batch, translated("d1"));
    b = { ...b, items: b.items.map((i) => ({ ...i, status: "ready" as const })) };
    expect(start(b, "de", true).items[0].draftId).toBeNull();
  });
});
