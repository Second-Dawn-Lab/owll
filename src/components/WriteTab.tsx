import { useSettings } from "@seconddawn/settings";
import { Button, EmptyState, Icon, IconButton, Spinner } from "@seconddawn/ui";
import { useEffect, useRef, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, IpcError, type WriteKind, type WritePiece } from "../ipc";
import { settingsStore } from "../settings/store";
import { CopyButton } from "./CopyButton";
import { LanguagePicker } from "./LanguagePicker";
import { useQuality } from "./useQuality";
import { usePacks } from "./usePacks";
import { useUndoableText } from "./useUndoableText";
import { transferParts } from "./transfer";
import { acceptedCount, applyPieces, changeCount, toggled } from "./writeModel";
import { activeKind, writeErrorKey } from "./writeError";

const KINDS: { kind: WriteKind; key: "write.improve" | "write.shorter" | "write.moreFormal" | "write.moreCasual" | "write.fixGrammar" }[] = [
  { kind: "improve", key: "write.improve" },
  { kind: "fixGrammar", key: "write.fixGrammar" },
  { kind: "shorter", key: "write.shorter" },
  { kind: "moreFormal", key: "write.moreFormal" },
  { kind: "moreCasual", key: "write.moreCasual" },
];

/**
 * The Write tab: rewrite your own text in the same language with the local model (Quality mode). The changes are shown
 * word by word; every change can be accepted or not, or all at once.
 */
export function WriteTab() {
  const { t, locale } = useT();
  const { settings } = useSettings(settingsStore);
  const quality = useQuality();
  const packs = usePacks();
  const input = useUndoableText("");
  const [language, setLanguage] = useState("auto");
  const [detected, setDetected] = useState<string | null>(null);
  const [busy, setBusy] = useState<WriteKind | null>(null);
  const [error, setError] = useState<{ text: string; retryHelps: boolean } | null>(null);
  /** The last action and the text it was for: its button stays marked, also after a failure. */
  const [last, setLast] = useState<{ kind: WriteKind; source: string } | null>(null);
  /** The rewrite of the text that was current when a button was pressed. */
  const [result, setResult] = useState<{ kind: WriteKind; source: string; pieces: WritePiece[]; accepted: boolean[]; model: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const run = useRef(0);

  // The language of the text: the one picked, or detected from the text.
  useEffect(() => {
    if (language !== "auto") return setDetected(null);
    if (!input.text.trim()) return setDetected(null);
    let stale = false;
    const timer = setTimeout(() => {
      void ipc.detectLanguage(input.text).then((d) => !stale && setDetected(d.status === "ok" ? d.code : null));
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [language, input.text]);

  // A different text makes an old rewrite meaningless.
  useEffect(() => {
    if (result && result.source !== input.text) setResult(null);
  }, [input.text]);

  const lang = language === "auto" ? detected : language;
  // The Write tab prefers the writing model; when it is not installed the translation model is used and this offers it.
  const writing = quality.status?.writing ?? null;
  const writingOffer = quality.ready && writing && !writing.installed && settings.qualityMode === "builtin" ? writing : null;
  const writingProgress = writing ? quality.status?.progress.find((p) => p.id === writing.id) : undefined;
  const can = quality.ready && !!lang && !!input.text.trim() && !busy;

  const rewrite = async (kind: WriteKind) => {
    if (!lang) return;
    const id = ++run.current;
    const source = input.text;
    setLast({ kind, source });
    setBusy(kind);
    setError(null);
    setResult(null);
    try {
      const out = await ipc.qualityWrite(kind, lang, source);
      if (run.current !== id) return;
      const n = changeCount(out.pieces);
      if (n === 0) setError({ text: t("write.nothingToChange"), retryHelps: false });
      else setResult({ kind, source, pieces: out.pieces, accepted: Array<boolean>(n).fill(true), model: out.model });
    } catch (e) {
      if (run.current !== id) return;
      const err = e instanceof IpcError ? e : new IpcError("unknown", String(e));
      if (err.code !== "cancelled") {
        const { key, retryHelps } = writeErrorKey(err.code);
        setError({ text: key === "write.error" && err.message ? err.message : t(key), retryHelps });
      }
    } finally {
      if (run.current === id) setBusy(null);
    }
  };

  const cancel = () => {
    run.current++;
    setBusy(null);
    void ipc.qualityPolishCancel();
  };

  const finalText = result ? applyPieces(result.pieces, result.accepted) : "";
  const setAll = (v: boolean) => result && setResult({ ...result, accepted: result.accepted.map(() => v) });

  if (!quality.ready) {
    return (
      <div className="write-tab">
        <div className="card-center">
          <EmptyState
            icon="pencil"
            title={t("write.offTitle")}
            action={
              <Button variant="primary" icon="settings" onClick={() => void ipc.openSettings("quality")}>
                {t("write.offAction")}
              </Button>
            }
          >
            {quality.on ? t("write.notReady") : t("write.offBody")}
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="write-tab text-tab">
      <div className="langbar">
        <span className="langbar__side" />
        <div className="langbar__center">
          <LanguagePicker
            label={t("write.language")}
            value={language}
            detected={language === "auto" ? detected : null}
            languages={packs.languages}
            allowAuto
            onChange={setLanguage}
          />
        </div>
        <span className="langbar__side langbar__side--end" />
      </div>

      {writingOffer && (
        <div className="write-offer" role="note">
          <Icon name="pencil" size={14} />
          <span>{t("write.betterModel")}</span>
          {writingProgress ? (
            <span>{(() => {
              const p = transferParts(writingProgress.done, writingProgress.total, writingProgress.speed);
              return [`${p.percent}%`, p.speed, p.eta].filter(Boolean).join(" · ");
            })()}</span>
          ) : (
            <Button icon="download" onClick={() => void ipc.qualityInstall(writingOffer.id)}>
              {t("write.betterModelDownload")}
            </Button>
          )}
        </div>
      )}

      <div className="write-kinds" role="toolbar" aria-label={t("write.kinds")}>
        {KINDS.map(({ kind, key }) => (
          <Button key={kind} variant={activeKind(busy, last, input.text) === kind ? "primary" : "default"} disabled={!can} onClick={() => void rewrite(kind)}>
            {t(key)}
          </Button>
        ))}
        {busy && (
          <span className="pane__busy">
            <Spinner /> {t("write.working")}
            <Button variant="ghost" onClick={cancel}>
              {t("common.cancel")}
            </Button>
          </span>
        )}
      </div>

      <div className="panes">
        <section className="pane">
          <textarea
            ref={inputRef}
            className="pane__text"
            value={input.text}
            placeholder={t("write.placeholder")}
            spellCheck={false}
            dir="auto"
            aria-label={t("write.input")}
            onChange={(e) => input.set(e.target.value)}
          />
          <footer className="pane__bar">
            <span className="pane__meta">{input.text.length > 0 && t("text.chars", { count: input.text.length })}</span>
            <div className="pane__actions">
              <IconButton icon="undo" label={t("action.undo")} disabled={!input.canUndo} onClick={input.undo} />
              <IconButton icon="redo" label={t("action.redo")} disabled={!input.canRedo} onClick={input.redo} />
              <CopyButton text={input.text} />
              <IconButton icon="close" label={t("action.clear")} disabled={!input.text} onClick={() => input.set("", true)} />
            </div>
          </footer>
        </section>

        <section className="pane pane--result" aria-live="polite">
          <div className="pane__text pane__result write-diff" dir="auto">
            {!result && !busy && !error && <span className="pane__placeholder">{t("write.resultPlaceholder")}</span>}
            {error && !busy && (
              <div className="pane__error" role="alert">
                <Icon name="alert" size={20} />
                <span>
                  {error.text}
                  {!error.retryHelps && ` ${t("write.sameAnswer")}`}
                </span>
              </div>
            )}
            {result &&
              result.pieces.map((p, i) =>
                p.kind === "same" ? (
                  <span key={i}>{p.text}</span>
                ) : (
                  <button
                    key={i}
                    type="button"
                    className={`write-change${result.accepted[p.id] ? " write-change--on" : " write-change--off"}`}
                    aria-pressed={result.accepted[p.id]}
                    title={result.accepted[p.id] ? t("write.changeKeep") : t("write.changeApply")}
                    onClick={() => setResult({ ...result, accepted: toggled(result.accepted, p.id) })}
                  >
                    {p.old && <del>{p.old}</del>}
                    {p.new && <ins>{p.new}</ins>}
                  </button>
                ),
              )}
          </div>
          <footer className="pane__bar">
            {/* One muted line: "1 of 1 changes accepted · English · Phi-4 mini"; it only wraps in a narrow window. */}
            <span className="pane__meta write-meta" title={result?.model ? t("write.usedModel", { model: result.model }) : undefined}>
              {result &&
                [
                  t("write.accepted", { done: acceptedCount(result.accepted), total: result.accepted.length }),
                  lang ? languageName(lang, locale, packs.languages.find((l) => l.code === lang)?.name) : "",
                  result.model,
                ]
                  .filter(Boolean)
                  .join(" · ")}
            </span>
            <div className="pane__actions">
              <Button variant="ghost" disabled={!result} onClick={() => setAll(true)}>
                {t("write.acceptAll")}
              </Button>
              <Button variant="ghost" disabled={!result} onClick={() => setAll(false)}>
                {t("write.rejectAll")}
              </Button>
              <Button
                variant="primary"
                disabled={!result}
                onClick={() => {
                  input.set(finalText, true);
                  setResult(null);
                  inputRef.current?.focus();
                }}
              >
                {t("write.use")}
              </Button>
              <CopyButton text={finalText} />
            </div>
          </footer>
        </section>
      </div>
      <p className="write-note">
        {t("write.note")}
        {settings.qualityMode === "ollama" ? " " + t("write.noteOllama") : ""}
      </p>
    </div>
  );
}
