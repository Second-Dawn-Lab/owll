import { useSettings } from "@seconddawn/settings";
import { Button, Icon, IconButton, Spinner } from "@seconddawn/ui";
import { useEffect, useRef, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, type CaptureResult, type OcrProblem } from "../ipc";
import { settingsStore } from "../settings/store";
import { CopyButton } from "./CopyButton";
import { DetectionNotice } from "./DetectionNotice";
import { LanguagePicker } from "./LanguagePicker";
import { ResultText } from "./ResultText";
import { ocrProblemText } from "./packText";
import { usePacks } from "./usePacks";
import { useTranslator } from "./useTranslator";

/** Translate the text in an image: dropped, opened, pasted, or captured from the screen. */
export function ImagesTab({ captured, dropped }: { captured?: CaptureResult | null; dropped?: { path: string; n: number } | null }) {
  const { t, locale } = useT();
  const { settings, patch } = useSettings(settingsStore);
  const packs = usePacks();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<OcrProblem | null>(null);
  const [badImage, setBadImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [typed, setTyped] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /** The source language the user picked ("auto": detect it); it is also the language OCR reads. */
  const [source, setSource] = useState("auto");
  const lastFile = useRef<Blob | null>(null);
  const state = useTranslator(text, source, settings.targetLanguage, packs.epoch, {
    debounceMs: typed ? 300 : 0,
    isUsable: (code) => !packs.loaded || !!packs.languages.find((l) => l.code === code && (l.builtIn || l.installed)),
    onTargetChange: (target) => void patch({ targetLanguage: target }),
  });
  const target = state.effectiveTo ?? settings.targetLanguage;

  const load = async (file: Blob) => {
    setBusy(true);
    setProblem(null);
    setBadImage(false);
    setTyped(false);
    setText("");
    lastFile.current = file;
    setImageUrl((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    try {
      const out = await ipc.ocrImage(new Uint8Array(await file.arrayBuffer()), source);
      setText(out.text);
      setProblem(out.problem ?? (out.text.trim() ? null : { code: "no_text", languages: [] }));
    } catch (e) {
      setBadImage((e as { code?: string }).code === "bad_image");
      setProblem({ code: "failed", languages: [] });
    } finally {
      setBusy(false);
    }
  };

  // A picture dropped on the window: Tauri gives the path, the backend the bytes.
  const lastDrop = useRef(0);
  useEffect(() => {
    if (!dropped || dropped.n === lastDrop.current) return;
    lastDrop.current = dropped.n;
    void ipc.readDroppedFile(dropped.path).then((bytes) => load(new Blob([bytes as BlobPart])));
  }, [dropped]);

  // An area capture arrives with its image and recognized text (the capture shortcut, or the button below).
  useEffect(() => {
    if (!captured) return;
    setBusy(false);
    setBadImage(false);
    setTyped(false);
    setImageUrl((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return captured.imageUrl;
    });
    lastFile.current = null;
    setText(captured.text);
    setProblem(captured.problem);
  }, [captured]);

  // Another source language: read the same picture again with it (a kept capture or the opened file).
  const read = useRef(source);
  useEffect(() => {
    if (source === read.current || source === "auto") {
      read.current = source;
      return;
    }
    read.current = source;
    if (!imageUrl) return;
    setBusy(true);
    const again = lastFile.current
      ? lastFile.current.arrayBuffer().then((b) => ipc.ocrImage(new Uint8Array(b), source))
      : ipc.ocrCaptureAgain(source);
    void again
      .then((out) => {
        setTyped(false);
        setText(out.text);
        setProblem(out.problem ?? (out.text.trim() ? null : { code: "no_text", languages: [] }));
      })
      .catch(() => setProblem({ code: "failed", languages: [] }))
      .finally(() => setBusy(false));
  }, [source]);

  // Ctrl+V with an image on the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void load(file);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // `load` only uses state setters.
  }, []);

  const pick = (files: FileList | null) => {
    const file = Array.from(files ?? []).find((f) => f.type.startsWith("image/"));
    if (file) void load(file);
  };

  const usable = packs.languages.filter((l) => l.installed || l.builtIn);
  const sourceLang = state.resolvedFrom ?? state.detected;

  return (
    <div className="images">
      <div className="langbar">
        <LanguagePicker label={t("lang.source")} value={source} languages={packs.languages} allowAuto detected={state.detected} onChange={setSource} />
        <span aria-hidden="true">{"\u2192"}</span>
        <LanguagePicker
          label={t("lang.target")}
          value={target}
          languages={usable}
          onChange={(code) => void patch({ targetLanguage: code })}
        />
      </div>
      <div className="images__panes">
        <section
          className={dragOver ? "pane images__image images__image--over" : "pane images__image"}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pick(e.dataTransfer.files);
          }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={t("images.preview")} />
          ) : (
            <div className="images__empty">
              <Icon name="image" size={34} />
              <p>{t("images.drop")}</p>
            </div>
          )}
          <footer className="pane__bar">
            <span className="pane__meta">{busy && <><Spinner /> {t("images.working")}</>}</span>
            <div className="pane__actions">
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files)} />
              <Button icon="folder" onClick={() => fileInput.current?.click()}>
                {t("images.open")}
              </Button>
              <Button icon="scan" onClick={() => void ipc.captureStart(true)}>
                {t("images.capture")}
              </Button>
            </div>
          </footer>
        </section>

        <div className="images__text">
          <section className="pane">
            <textarea
              className="pane__text images__recognized"
              value={text}
              placeholder={t("images.recognized")}
              spellCheck={false}
              dir="auto"
              aria-label={t("images.recognized")}
              onChange={(e) => {
                setTyped(true);
                setText(e.target.value);
              }}
            />
            <footer className="pane__bar">
              <span className="pane__meta">{sourceLang && t("lang.detected", { lang: languageName(sourceLang, locale) })}</span>
              <div className="pane__actions">
                <CopyButton text={text} />
                <IconButton icon="close" label={t("action.clear")} disabled={!text} onClick={() => setText("")} />
              </div>
            </footer>
          </section>
          <section className="pane pane--result" aria-live="polite">
            <div className="pane__text pane__result" dir="auto" lang={target}>
              {problem && !busy && (
                <div className="pane__error" role="status">
                  <Icon name="alert" size={20} />
                  <span>{badImage ? t("images.badImage") : ocrProblemText(t, problem, (c) => languageName(c, locale))}</span>
                  {problem.code === "language_missing" && (
                    <Button icon="download" onClick={() => void ipc.openWindowsLanguageSettings()}>
                      {t("quick.installOcr")}
                    </Button>
                  )}
                </div>
              )}
              {state.status === "translating" && !state.result && (
                <span className="pane__busy">
                  <Spinner />
                  {t("text.translating")}
                </span>
              )}
              {(state.status === "done" || (state.status === "translating" && state.result)) && (
                <ResultText text={state.result} segments={state.status === "done" ? state.segments : []} from={state.resolvedFrom ?? "en"} to={target} onPick={state.pick} />
              )}
              {(state.status === "undetected" || state.status === "unavailable") && (
                <DetectionNotice state={state} packs={packs} onPickSource={() => {}} />
              )}
            </div>
            <footer className="pane__bar">
              <span className="pane__meta" />
              <div className="pane__actions">
                <CopyButton text={state.status === "done" ? state.result : ""} />
              </div>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
