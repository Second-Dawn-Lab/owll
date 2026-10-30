import { useSettings } from "@seconddawn/settings";
import { Button, Icon, ProgressBar } from "@seconddawn/ui";
import { useEffect, useRef, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, IpcError } from "../ipc";
import { settingsStore } from "../settings/store";
import * as batchOps from "./batchQueue";
import type { Batch, BatchItem } from "./batchQueue";
import { docFailureKey, DOC_EXTENSIONS } from "./docFiles";
import { GlossaryPicker } from "./GlossaryPicker";
import { LanguagePicker } from "./LanguagePicker";
import { decidePdf } from "./pdfChoice";
import { formatBytes, usePacks } from "./usePacks";

/**
 * Document translation for one or many files: drop or choose them, check each file's language, translate.
 * Files are translated one after another in the background; each result is written next to the original,
 * in the download folder, or where the user chooses, and the originals are never changed.
 */
export function FilesTab({ incoming }: { incoming: { paths: string[]; n: number } | null }) {
  const { t, locale } = useT();
  const { settings, patch } = useSettings(settingsStore);
  const packs = usePacks();
  const [batch, setBatch] = useState<Batch>(batchOps.emptyBatch);
  const handled = useRef(0);
  /** Files already being inspected. */
  const inspecting = useRef(new Set<number>());
  /** The file the backend was last told to translate, so a start is sent only once. */
  const started = useRef(0);
  /** Where results go for this batch when the download location asks each time. */
  const folder = useRef<string | null>(null);
  const target = settings.targetLanguage;
  const usable = packs.languages.filter((l) => l.installed || l.builtIn);

  const add = (paths: string[]) => {
    if (paths.length === 0) return;
    setBatch((b) => batchOps.addPaths(b, paths));
  };

  // Files dropped on the window.
  useEffect(() => {
    if (incoming && incoming.n !== handled.current) {
      handled.current = incoming.n;
      add(incoming.paths);
    }
  }, [incoming]);

  // Look at every new file: its type, size, language, and whether it can be read at all.
  useEffect(() => {
    for (const item of batch.items) {
      if (item.status !== "inspecting" || inspecting.current.has(item.id)) continue;
      inspecting.current.add(item.id);
      void ipc
        .docInspect(item.path)
        .then((info) => setBatch((b) => batchOps.inspected(b, item.id, info)))
        .catch((e: IpcError) => setBatch((b) => batchOps.inspectFailed(b, item.id, { code: e.code, message: e.message })));
    }
  }, [batch.items]);

  // Backend events for the file in progress.
  useEffect(() => {
    const offs = [
      ipc.onDocProgress((p) => setBatch((b) => batchOps.progress(b, p.done, p.total))),
      ipc.onDocDone((result) => setBatch((b) => batchOps.finished(b, result))),
      ipc.onDocFailed((f) => setBatch((b) => batchOps.failed(b, { code: f.code, message: f.message }))),
    ];
    return () => offs.forEach((off) => void off.then((fn) => fn()));
  }, []);

  const run = async (item: BatchItem) => {
    const from = batchOps.sourceOf(item);
    try {
      if (!from) throw new IpcError("bad_request", "no language");
      const output = await ipc.docDefaultOutput(item.path, target, folder.current);
      await ipc.docTranslate(item.path, from, target, output);
    } catch (e) {
      const err = e as IpcError;
      setBatch((b) => batchOps.failed(b, { code: err.code ?? "unknown", message: err.message ?? "" }));
    }
  };

  // Run the queue: when nothing is translating, the next waiting file starts.
  useEffect(() => {
    if (!batch.running) return;
    const next = batchOps.takeNext(batch);
    if (!next.item) {
      if (next.batch !== batch) setBatch(next.batch);
      return;
    }
    if (started.current === next.item.id) return;
    started.current = next.item.id;
    setBatch(next.batch);
    void run(next.item);
  }, [batch]);

  const choose = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: true, filters: [{ name: t("files.filter"), extensions: DOC_EXTENSIONS }] });
    if (Array.isArray(picked)) add(picked);
    else if (typeof picked === "string") add([picked]);
  };

  const ready = batchOps.startable(batch, target);
  const busy = batchOps.busy(batch);

  const translateAll = async () => {
    folder.current = null;
    // "Ask each time": one folder for several files (not a dialog per file), a save dialog for a single one.
    if (settings.downloadLocation === "ask" && ready.length > 1) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true, multiple: false, title: t("files.pickFolder") });
      if (typeof picked !== "string") return;
      folder.current = picked;
    } else if (settings.downloadLocation === "ask" && ready.length === 1) {
      const output = await ipc.docDefaultOutput(ready[0].path, target, null);
      const { save } = await import("@tauri-apps/plugin-dialog");
      const chosen = await save({ defaultPath: output, filters: [{ name: ready[0].name, extensions: [output.split(".").pop() ?? "docx"] }] });
      if (!chosen) return;
      folder.current = chosen.replace(/[\\/][^\\/]*$/, "");
    }
    // PDFs become Word documents until "Keep as PDF" exists; then this is where the question appears.
    void decidePdf(batchOps.pdfItems(ready).length, { pdfOutput: settings.pdfOutput, pdfAsk: settings.pdfAsk });
    started.current = 0;
    setBatch((b) => batchOps.start(b, target));
  };

  const cancelAll = () => {
    setBatch((b) => batchOps.cancel(b));
    void ipc.docCancel();
  };

  const overall = batchOps.overall(batch);
  const failureText = (item: BatchItem) => {
    const error = item.error;
    if (!error) return "";
    const key = docFailureKey(error.code);
    if (error.code === "pack_missing" || error.code === "model_load") return t(key, { lang: languageName(error.message, locale) });
    if (error.code === "too_large") return t(key, { size: "100 MB" });
    return key === "files.failed.other" ? `${t(key)} ${error.message}` : t(key);
  };

  if (batch.items.length === 0) {
    return (
      <div className="files">
        <section className="files__drop">
          <Icon name="file" size={40} />
          <p>{t("files.drop")}</p>
          <p className="files__hint">{t("files.types")}</p>
          <Button variant="primary" icon="folder" onClick={() => void choose()}>
            {t("files.chooseMany")}
          </Button>
          <p className="files__hint">{t("files.limit", { size: "100 MB" })}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="files files--batch">
      <div className="langbar">
        <span>{t("files.translateInto")}</span>
        <LanguagePicker label={t("lang.target")} value={target} languages={usable} onChange={(code) => void patch({ targetLanguage: code })} />
        <GlossaryPicker />
      </div>

      <ul className="files__list" aria-label={t("tab.files")}>
        {batch.items.map((item) => {
          const from = batchOps.sourceOf(item);
          const editable = item.status === "ready" || item.status === "waiting";
          return (
            <li key={item.id} className={`files__row files__row--${item.status}`}>
              <Icon name={item.kind === "xlsx" ? "text" : "file"} size={20} />
              <span className="files__rowname" title={item.path}>
                <strong>{item.name}</strong>
                <span className="files__hint">{item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : ""}</span>
              </span>
              <span className="files__rowlang">
                {item.status === "inspecting" ? (
                  <span className="files__hint">{t("files.reading")}</span>
                ) : item.kind ? (
                  <LanguagePicker
                    label={t("files.sourceOf", { name: item.name })}
                    value={item.source}
                    detected={item.detected}
                    languages={packs.languages}
                    allowAuto
                    onChange={(code) => editable && setBatch((b) => batchOps.setSource(b, item.id, code))}
                  />
                ) : null}
                {item.status === "ready" && !from && <span className="files__hint">{t("files.detectFailedShort")}</span>}
                {item.status === "ready" && from === target && <span className="files__hint">{t("files.sameLanguage")}</span>}
              </span>
              <span className="files__status" aria-live="polite">
                {item.status === "waiting" && t("files.status.waiting")}
                {item.status === "translating" && (
                  <>
                    <ProgressBar value={item.done} max={item.total || undefined} label={item.name} />
                    <span className="files__hint">{item.total > 0 ? t("files.progress", { percent: Math.round((item.done / item.total) * 100) }) : t("files.working")}</span>
                  </>
                )}
                {item.status === "done" && (
                  <>
                    <Icon name="check" size={16} /> {t("files.status.done")}
                  </>
                )}
                {item.status === "error" && (
                  <span className="files__error" role="alert">
                    <Icon name="alert" size={16} /> {failureText(item)}
                  </span>
                )}
              </span>
              <span className="files__rowactions">
                {item.status === "done" && item.output && (
                  <>
                    <Button variant="ghost" onClick={() => void ipc.docOpen(item.output!)}>
                      {t("files.open")}
                    </Button>
                    <Button variant="ghost" onClick={() => void ipc.docShowInFolder(item.output!)}>
                      {t("files.show")}
                    </Button>
                  </>
                )}
                {item.status === "error" && (item.error?.code === "pack_missing" || item.error?.code === "model_load") && (
                  <Button variant="ghost" icon="download" onClick={() => void ipc.openSettings("packs")}>
                    {t("packs.download")}
                  </Button>
                )}
                {item.status !== "translating" && (
                  <button
                    type="button"
                    className="files__remove"
                    aria-label={t("files.remove", { name: item.name })}
                    title={t("files.remove", { name: item.name })}
                    onClick={() => setBatch((b) => batchOps.remove(b, item.id))}
                  >
                    {"×"}
                  </button>
                )}
              </span>
              {item.status === "done" && item.result && item.result.skipped.length > 0 && (
                <details className="files__skipped">
                  <summary>{t("files.skippedCount", { count: item.result.skipped.length })}</summary>
                  <ul>
                    {item.result.skipped.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      <div className="files__footer">
        {busy ? (
          <>
            <ProgressBar value={Math.round(overall.fraction * 1000)} max={1000} label={t("files.overall")} />
            <span>{t("files.overallText", { done: overall.done, total: overall.total })}</span>
            <Button onClick={cancelAll}>{t("files.cancelAll")}</Button>
          </>
        ) : (
          <>
            <Button icon="folder" onClick={() => void choose()}>
              {t("files.addMore")}
            </Button>
            <Button variant="primary" disabled={ready.length === 0} onClick={() => void translateAll()}>
              {t("files.translateN", { count: ready.length })}
            </Button>
            <Button variant="ghost" onClick={() => setBatch(batchOps.emptyBatch)}>
              {t("files.clearList")}
            </Button>
          </>
        )}
        <span className="files__hint">{t("files.stayUsable")}</span>
      </div>
    </div>
  );
}
