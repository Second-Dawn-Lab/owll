import { useSettings } from "@seconddawn/settings";
import { Button, Dialog, EmptyState, Icon, IconButton, ProgressBar, Spinner } from "@seconddawn/ui";
import { useEffect, useRef, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, type HistoryEntry } from "../ipc";
import { settingsStore } from "../settings/store";
import { trace } from "../trace";
import { CopyButton } from "./CopyButton";
import { DetectionNotice } from "./DetectionNotice";
import { DictionaryPanel } from "./DictionaryPanel";
import { showWord, wordAt } from "./dictionaryStore";
import { GlossaryPicker, useGlossaryVersion } from "./GlossaryPicker";
import { ResultText } from "./ResultText";
import { LanguagePicker } from "./LanguagePicker";
import { packErrorText } from "./packText";
import { formatBytes, usePacks } from "./usePacks";
import { useTranslator } from "./useTranslator";
import { useUndoableText } from "./useUndoableText";

/** How long the input must rest before a translation is saved to history. */
const HISTORY_DELAY_MS = 1500;

type Side = "sourceLanguage" | "targetLanguage";

/** `incoming` is a history entry the user chose to translate again. */
export function TextTab({
  incoming,
  quick,
  capture,
  onDismissCapture,
}: {
  incoming: HistoryEntry | null;
  quick: { text: string; n: number } | null;
  /** The text came from an area capture: its image can be viewed. */
  capture?: { id: number; imageUrl: string } | null;
  onDismissCapture?: () => void;
}) {
  const [viewImage, setViewImage] = useState(false);
  const { t, locale } = useT();
  const { settings, patch } = useSettings(settingsStore);
  const { sourceLanguage: from, targetLanguage: to } = settings;

  const packs = usePacks();
  const input = useUndoableText("");
  const glossaryVersion = useGlossaryVersion();
  const state = useTranslator(input.text, from, to, packs.epoch * 1000 + glossaryVersion + settings.glossaryActive.length * 7, {
    // A language is usable when it is built in or active; while the list loads, assume yes.
    isUsable: (code) => !packs.loaded || !!packs.languages.find((l) => l.code === code && (l.builtIn || l.installed)),
  });
  const [offer, setOffer] = useState<{ code: string; side: Side | null } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const knownInstalled = useRef<string[] | null>(null);
  const renders = useRef(0);
  renders.current += 1;
  useEffect(() => trace(`TextTab commit #${renders.current} (status ${state.status})`));
  useEffect(() => {
    if (!state.result) return;
    const label = `${state.status}${state.refining ? ", refining" : ""}, ${state.result.length} chars`;
    requestAnimationFrame(() => trace(`result painted (${label})`));
  }, [state.status, state.refining, state.result]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the target language usable: on first load, and whenever a language finishes installing.
  useEffect(() => {
    if (!packs.loaded) return;
    const installed = packs.languages.filter((l) => !l.builtIn && l.installed).map((l) => l.code);
    const before = knownInstalled.current;
    knownInstalled.current = installed;
    if (to === "en" || installed.includes(to)) return;
    const fresh = before === null ? installed[0] : installed.find((c) => !before.includes(c));
    if (fresh && !packs.isBusy(to)) void patch({ targetLanguage: fresh });
    // Runs when the language list changes; `to` and `patch` are read at that moment.
  }, [packs.languages]);

  useEffect(() => {
    if (!incoming) return;
    void patch({ sourceLanguage: incoming.from, targetLanguage: incoming.to });
    input.set(incoming.source, true);
    inputRef.current?.focus();
    // Only when a new entry arrives.
  }, [incoming]);

  // Text sent by quick access: translate it with automatic language detection.
  useEffect(() => {
    if (!quick) return;
    void patch({ sourceLanguage: "auto" });
    input.set(quick.text, true);
    inputRef.current?.focus();
    // Only when new text arrives.
  }, [quick]);

  // Save to history once the user stops typing. The backend honors "keep history".
  useEffect(() => {
    if (state.status !== "done" || state.refining || !state.resolvedFrom) return;
    const timer = setTimeout(() => {
      void ipc.historyAdd(state.resolvedFrom!, state.effectiveTo ?? to, input.text, state.result);
    }, HISTORY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.status, state.refining, state.result, state.resolvedFrom, to, input.text]);

  const nameOf = (code: string) => languageName(code, locale, packs.languages.find((l) => l.code === code)?.name);

  /** Choose a language; one that is not installed first asks to download it. */
  const choose = (side: Side, code: string) => {
    const lang = packs.languages.find((l) => l.code === code);
    if (code === "auto" || !lang || lang.installed || packs.isBusy(code)) void patch({ [side]: code });
    else setOffer({ code, side });
  };

  const confirmOffer = () => {
    if (!offer) return;
    void packs.install(offer.code);
    if (offer.side) void patch({ [offer.side]: offer.code });
    setOffer(null);
  };

  const canSwap = from !== "auto" || !!state.detected;
  const swap = () => {
    const newTo = from === "auto" ? state.detected : from;
    if (!newTo) return;
    const newText = state.status === "done" ? state.result : input.text;
    void patch({ sourceLanguage: to, targetLanguage: newTo });
    input.set(newText, true);
  };

  const showDetected = from === "auto" ? state.detected : null;
  const hasText = input.text.length > 0;
  const offered = offer ? packs.languages.find((l) => l.code === offer.code) : undefined;

  if (packs.loaded && !packs.hasExtra) {
    return (
      <div className="text-tab">
        <div className="card-center">
          <EmptyState
            icon="globe"
            title={t("first.title")}
            action={
              <Button variant="primary" icon="package" onClick={() => void ipc.openSettings("packs")}>
                {t("first.action")}
              </Button>
            }
          >
            {t("first.body")}
          </EmptyState>
        </div>
      </div>
    );
  }

  /** The result pane when translation failed, or while the needed language downloads. */
  const renderError = () => {
    const err = state.error;
    if (!err) return null;
    const lang = err.code === "pack_missing" || err.code === "model_load" ? err.message : null;
    if (lang) {
      const progress = packs.progress[lang];
      if (packs.isBusy(lang)) {
        const percent = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;
        return (
          <div className="pane__error" role="status">
            <span className="pane__busy">
              <Spinner />
              {t("pack.downloadingLang", { lang: nameOf(lang), percent })}
            </span>
            <ProgressBar value={progress?.done ?? 0} max={progress?.total} label={nameOf(lang)} />
            <Button onClick={() => void packs.cancel(lang)}>{t("common.cancel")}</Button>
          </div>
        );
      }
      const failed = progress?.phase === "error" ? packErrorText(t, progress.errorCode, progress.error) : null;
      const damaged = err.code === "model_load";
      return (
        <div className="pane__error" role="alert">
          <Icon name="alert" size={22} />
          <strong>{t(damaged ? "text.damagedTitle" : "text.errorTitle")}</strong>
          <span>{failed ?? t(damaged ? "text.damaged" : "text.packMissing", { lang: nameOf(lang) })}</span>
          {damaged ? (
            <Button icon="download" onClick={() => void packs.repair(lang)}>
              {t("pack.repair")}
            </Button>
          ) : (
            <Button icon="download" onClick={() => setOffer({ code: lang, side: null })}>
              {t("pack.downloadLang", { lang: nameOf(lang) })}
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className="pane__error" role="alert">
        <Icon name="alert" size={22} />
        <strong>{t("text.errorTitle")}</strong>
        <span>{t("text.engineError")}</span>
      </div>
    );
  };

  return (
    <div className="text-tab">
      <div className="langbar">
        <span className="langbar__side" />
        <div className="langbar__center">
          <LanguagePicker
            label={t("lang.source")}
            value={from}
            detected={showDetected}
            languages={packs.languages}
            allowAuto
            onChange={(code) => choose("sourceLanguage", code)}
          />
          <IconButton icon="swap" label={t("action.swap")} disabled={!canSwap} onClick={swap} />
          {/* Never rewritten by the "same language" rule: when source and target are equal the translation goes to the
              smart target and the picker shows it, but the saved choice stays the one the user made. */}
          <LanguagePicker
            label={t("lang.target")}
            value={state.status === "done" && state.effectiveTo ? state.effectiveTo : to}
            languages={packs.languages}
            onChange={(code) => choose("targetLanguage", code)}
          />
        </div>
        <span className="langbar__side langbar__side--end">
          <GlossaryPicker />
        </span>
      </div>

      {capture && (
        <div className="capturechip" role="status">
          <Icon name="scan" size={14} />
          <span>{t("capture.chip")}</span>
          <Button variant="ghost" icon="image" onClick={() => setViewImage(true)}>
            {t("capture.view")}
          </Button>
          <IconButton icon="close" label={t("capture.dismiss")} onClick={onDismissCapture ?? (() => {})} />
        </div>
      )}
      <Dialog
        open={viewImage && !!capture}
        title={t("capture.imageTitle")}
        onClose={() => setViewImage(false)}
        footer={<Button onClick={() => setViewImage(false)}>{t("common.close")}</Button>}
      >
        {capture && <img className="capturechip__image" src={capture.imageUrl} alt={t("capture.imageTitle")} />}
      </Dialog>

      <div className="panes">
        <section className="pane">
          <textarea
            ref={inputRef}
            className="pane__text"
            value={input.text}
            placeholder={t("text.placeholder")}
            spellCheck={false}
            dir="auto"
            aria-label={t("lang.source")}
            onDoubleClick={(e) => {
              // A double click selects a word: look it up in the dictionary (the source language, into the target).
              const area = e.currentTarget;
              const word = wordAt(area.value, area.selectionStart, area.selectionEnd);
              const lang = state.resolvedFrom ?? (settings.sourceLanguage !== "auto" ? settings.sourceLanguage : null);
              if (word && lang) showWord({ word, lang, partner: state.effectiveTo ?? to }, true);
            }}
            onChange={(e) => {
              trace(`input change: ${e.target.value.length} chars`);
              input.set(e.target.value);
            }}
          />
          <footer className="pane__bar">
            <span className="pane__meta">{hasText && t("text.chars", { count: input.text.length })}</span>
            <div className="pane__actions">
              <IconButton icon="undo" label={t("action.undo")} disabled={!input.canUndo} onClick={input.undo} />
              <IconButton icon="redo" label={t("action.redo")} disabled={!input.canRedo} onClick={input.redo} />
              <CopyButton text={input.text} />
              <IconButton icon="scan" label={t("text.capture")} onClick={() => void ipc.captureStart(true)} />
              <IconButton
                icon="close"
                label={t("action.clear")}
                disabled={!hasText}
                onClick={() => {
                  input.set("", true);
                  inputRef.current?.focus();
                }}
              />
            </div>
          </footer>
        </section>

        <section className="pane pane--result" aria-live="polite">
          <div className="pane__text pane__result" dir="auto">
            {state.status === "idle" && <span className="pane__placeholder">{t("text.resultPlaceholder")}</span>}
            {state.status === "translating" && !state.result && (
              <span className="pane__busy">
                <Spinner />
                {t("text.translating")}
              </span>
            )}
            {(state.status === "done" || (state.status === "translating" && state.result)) && (
              <ResultText
                text={state.result}
                segments={state.status === "done" ? state.segments : []}
                terms={state.status === "done" ? state.glossaryTerms : []}
                from={state.resolvedFrom ?? "en"}
                to={state.effectiveTo ?? to}
                onPick={state.pick}
                sentenceAlternatives
                dimmed={state.status === "translating" && !state.fresh}
              />
            )}
            {state.status === "error" && renderError()}
            {(state.status === "undetected" || state.status === "unavailable") && (
              <DetectionNotice state={state} packs={packs} onPickSource={(code) => void patch({ sourceLanguage: code })} />
            )}
          </div>
          <footer className="pane__bar">
            <span className="pane__meta">
              {state.status === "translating" && state.result && (
                <>
                  <Spinner /> {t("text.translating")}
                </>
              )}
              {state.status === "done" && state.glossaryHits > 0 && (
                <span className="pane__via" title={t("gloss.applied", { count: state.glossaryHits })}>
                  <Icon name="text" size={13} /> {t("gloss.applied", { count: state.glossaryHits })}
                </span>
              )}
              {state.status === "done" && state.pivoted && (
                <span className="pane__via" title={t("text.viaEnglishHint")}>
                  <Icon name="swap" size={13} />
                  {t("text.viaEnglish")}
                </span>
              )}
            </span>
            <div className="pane__actions">
              <CopyButton text={state.status === "done" ? state.result : ""} />
            </div>
          </footer>
        </section>
      </div>

      <DictionaryPanel />

      <Dialog
        open={!!offered}
        title={offered ? t("pack.offerTitle", { lang: nameOf(offered.code) }) : ""}
        onClose={() => setOffer(null)}
        footer={
          <>
            <Button onClick={() => setOffer(null)}>{t("common.cancel")}</Button>
            <Button variant="primary" icon="download" onClick={confirmOffer}>
              {t("packs.download")}
            </Button>
          </>
        }
      >
        {offered && <p>{t("pack.offerBody", { lang: nameOf(offered.code), size: formatBytes(offered.sizeBytes || offered.totalBytes) })}</p>}
      </Dialog>
    </div>
  );
}
