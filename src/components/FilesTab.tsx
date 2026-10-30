import { useSettings } from "@seconddawn/settings";
import { Button, Icon, ProgressBar } from "@seconddawn/ui";
import { useEffect, useRef, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, IpcError, type DocDone, type DocInfo } from "../ipc";
import { settingsStore } from "../settings/store";
import { LanguagePicker } from "./LanguagePicker";
import { usePacks } from "./usePacks";
import { formatBytes } from "./usePacks";
import { docFailureKey, DOC_EXTENSIONS } from "./docFiles";

type Phase =
  | { kind: "empty" }
  | { kind: "inspecting"; path: string }
  | { kind: "ready"; info: DocInfo }
  | { kind: "running"; info: DocInfo; done: number; total: number; output: string }
  | { kind: "done"; info: DocInfo; result: DocDone }
  | { kind: "failed"; info: DocInfo | null; code: string; message: string };

/**
 * Document translation: drop or choose a file, check its language, translate. The translated copy
 * is written next to the original or where the user chooses, and the original is never changed.
 */
export function FilesTab({ incomingPath }: { incomingPath: { path: string; n: number } | null }) {
  const { t, locale } = useT();
  const { settings, patch } = useSettings(settingsStore);
  const packs = usePacks();
  const [phase, setPhase] = useState<Phase>({ kind: "empty" });
  const [source, setSource] = useState<string>("auto");
  const handled = useRef(0);

  const usable = packs.languages.filter((l) => l.installed || l.builtIn);

  const inspect = async (path: string) => {
    setPhase({ kind: "inspecting", path });
    try {
      const info = await ipc.docInspect(path);
      setSource("auto");
      setPhase({ kind: "ready", info });
    } catch (e) {
      const err = e as IpcError;
      setPhase({ kind: "failed", info: null, code: err.code, message: err.message });
    }
  };

  // A file dropped on the window, or on the Text tab.
  useEffect(() => {
    if (incomingPath && incomingPath.n !== handled.current) {
      handled.current = incomingPath.n;
      void inspect(incomingPath.path);
    }
  }, [incomingPath]);

  useEffect(() => {
    const offs = [
      ipc.onDocProgress((p) => setPhase((s) => (s.kind === "running" ? { ...s, done: p.done, total: p.total } : s))),
      ipc.onDocDone((result) => setPhase((s) => (s.kind === "running" ? { kind: "done", info: s.info, result } : s))),
      ipc.onDocFailed((f) => setPhase((s) => ({ kind: "failed", info: "info" in s ? s.info : null, code: f.code, message: f.message }))),
    ];
    return () => offs.forEach((off) => void off.then((fn) => fn()));
  }, []);

  const choose = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, filters: [{ name: t("files.filter"), extensions: DOC_EXTENSIONS }] });
    if (typeof picked === "string") void inspect(picked);
  };

  const from = phase.kind === "ready" && source === "auto" ? (phase.info.detected ?? "auto") : source;
  const target = settings.targetLanguage;

  const start = async () => {
    if (phase.kind !== "ready" || from === "auto") return;
    const info = phase.info;
    let output = await ipc.docDefaultOutput(info.path, target);
    if (settings.downloadLocation === "ask") {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const chosen = await save({ defaultPath: output, filters: [{ name: info.name, extensions: [output.split(".").pop() ?? "docx"] }] });
      if (!chosen) return;
      output = chosen;
    }
    setPhase({ kind: "running", info, done: 0, total: 0, output });
    try {
      await ipc.docTranslate(info.path, from, target, output);
    } catch (e) {
      const err = e as IpcError;
      setPhase({ kind: "failed", info, code: err.code, message: err.message });
    }
  };

  const reset = () => setPhase({ kind: "empty" });
  const percent = phase.kind === "running" && phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0;

  const failureText = (code: string, message: string) => {
    const key = docFailureKey(code);
    if (code === "pack_missing" || code === "model_load") return t(key, { lang: languageName(message, locale) });
    return key === "files.failed.other" ? `${t(key)} ${message}` : t(key);
  };

  return (
    <div className="files">
      {phase.kind === "empty" && (
        <section className="files__drop">
          <Icon name="file" size={40} />
          <p>{t("files.drop")}</p>
          <p className="files__hint">{t("files.types")}</p>
          <Button variant="primary" icon="folder" onClick={() => void choose()}>
            {t("files.choose")}
          </Button>
          <p className="files__hint">{t("files.limit", { size: "100 MB" })}</p>
        </section>
      )}

      {phase.kind === "inspecting" && (
        <section className="files__card" aria-live="polite">
          <ProgressBar value={0} label={t("files.reading")} />
          <p>{t("files.reading")}</p>
        </section>
      )}

      {phase.kind === "ready" && (
        <section className="files__card">
          <div className="files__name">
            <Icon name="file" size={22} />
            <strong>{phase.info.name}</strong>
            <span className="files__hint">{formatBytes(phase.info.sizeBytes)}</span>
          </div>
          {phase.info.tooLarge ? (
            <p className="pane__error">{t("files.failed.too_large", { size: "100 MB" })}</p>
          ) : (
            <>
              <div className="langbar">
                <LanguagePicker
                  label={t("lang.source")}
                  value={source}
                  detected={phase.info.detected}
                  languages={packs.languages}
                  allowAuto
                  onChange={setSource}
                />
                <span aria-hidden="true">→</span>
                <LanguagePicker label={t("lang.target")} value={target} languages={usable} onChange={(code) => void patch({ targetLanguage: code })} />
              </div>
              {phase.info.detection !== "ok" && source === "auto" && <p className="files__hint">{t("files.detectFailed")}</p>}
              {phase.info.kind === "pdf" && <p className="files__hint">{t("files.pdfNote")}</p>}
              <div className="files__actions">
                <Button variant="primary" disabled={from === "auto" || from === target} onClick={() => void start()}>
                  {t("files.translate")}
                </Button>
                <Button variant="ghost" onClick={reset}>
                  {t("common.cancel")}
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {phase.kind === "running" && (
        <section className="files__card" aria-live="polite">
          <div className="files__name">
            <Icon name="file" size={22} />
            <strong>{phase.info.name}</strong>
          </div>
          <ProgressBar value={phase.done} max={phase.total || undefined} label={t("files.working")} />
          <p>{phase.total > 0 ? t("files.progress", { percent }) : t("files.working")}</p>
          <div className="files__actions">
            <Button onClick={() => void ipc.docCancel()}>{t("common.cancel")}</Button>
          </div>
          <p className="files__hint">{t("files.stayUsable")}</p>
        </section>
      )}

      {phase.kind === "done" && (
        <section className="files__card" aria-live="polite">
          <div className="files__name">
            <Icon name="check" size={22} />
            <strong>{t("files.done")}</strong>
          </div>
          <p className="files__path">{phase.result.output}</p>
          <p>
            {t("files.summary", { units: phase.result.units })}
            {phase.result.parts ? ` ${t(`files.parts.${phase.result.parts[1]}` as "files.parts.slides", { n: phase.result.parts[0] })}` : ""}
          </p>
          {phase.result.skipped.length > 0 && (
            <div className="files__skipped">
              <strong>{t("files.skipped")}</strong>
              <ul>
                {phase.result.skipped.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="files__actions">
            <Button variant="primary" onClick={() => void ipc.docOpen(phase.result.output)}>
              {t("files.open")}
            </Button>
            <Button onClick={() => void ipc.docShowInFolder(phase.result.output)}>{t("files.show")}</Button>
            <Button variant="ghost" onClick={reset}>
              {t("files.another")}
            </Button>
          </div>
        </section>
      )}

      {phase.kind === "failed" && (
        <section className="files__card" role="alert">
          <div className="files__name">
            <Icon name="alert" size={22} />
            <strong>{phase.code === "cancelled" ? t("files.failed.cancelled") : failureText(phase.code, phase.message)}</strong>
          </div>
          <div className="files__actions">
            {(phase.code === "pack_missing" || phase.code === "model_load") && (
              <Button variant="primary" icon="download" onClick={() => void ipc.openSettings("packs")}>
                {t("packs.download")}
              </Button>
            )}
            <Button onClick={reset}>{t("files.another")}</Button>
          </div>
        </section>
      )}
    </div>
  );
}
