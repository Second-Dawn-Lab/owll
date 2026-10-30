import { useSettings } from "@seconddawn/settings";
import { Button, Icon, IconButton, Menu, Spinner, type MenuEntry } from "@seconddawn/ui";
import { useEffect, useRef, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, type OcrProblem } from "../ipc";
import { settingsStore } from "../settings/store";
import { trace } from "../trace";
import { CopyButton } from "./CopyButton";
import { ocrProblemText } from "./packText";
import { DetectionNotice } from "./DetectionNotice";
import { LanguagePicker } from "./LanguagePicker";
import { ResultText } from "./ResultText";
import { usePacks } from "./usePacks";
import { useTranslator } from "./useTranslator";

/**
 * The small window next to the pointer: the translation, and a few actions.
 * The backend decides when it appears (shortcut) and when it hides (focus loss, unless pinned
 * or being resized).
 */
export function QuickPopup() {
  const { t, locale } = useT();
  const { settings, patch } = useSettings(settingsStore);
  const packs = usePacks();

  const [text, setText] = useState("");
  const [app, setApp] = useState<string | null>(null);
  const [canReplace, setCanReplace] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [problem, setProblem] = useState<OcrProblem | null>(null);
  const [sourceGone, setSourceGone] = useState(false);
  const [from, setFrom] = useState("auto");
  const [typed, setTyped] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  // The text arrives complete, so translation starts at once; typing in an empty popup is debounced.
  const state = useTranslator(text, from, settings.targetLanguage, packs.epoch, {
    debounceMs: typed ? 300 : 0,
    isUsable: (code) => !packs.loaded || !!packs.languages.find((l) => l.code === code && (l.builtIn || l.installed)),
  });
  const target = state.effectiveTo ?? settings.targetLanguage;

  // The backend says "a request is waiting" every time the popup opens.
  useEffect(() => {
    const take = () =>
      void ipc.quickTake().then((request) => {
        if (!request) return;
        trace(`popup: request received (${request.text?.length ?? 0} chars)`);
        setText(request.text ?? "");
        setApp(request.app);
        setCanReplace(request.canReplace);
        setCaptured(request.kind === "capture");
        setProblem(request.problem);
        setSourceGone(false);
        setFrom("auto");
        setTyped(false);
        setPinned(false);
        setShowOriginal(!request.text && !request.problem);
        if (!request.text && !request.problem) setTimeout(() => sourceRef.current?.focus(), 50);
      });
    take(); // the window may have been opened before this page finished loading
    const unlisten = ipc.onQuickOpen(take);
    return () => void unlisten.then((fn) => fn());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void ipc.quickHide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Save to history (the backend honors "keep history"). The text is final, so no waiting.
  useEffect(() => {
    if (state.status !== "done" || state.refining || !state.resolvedFrom || !text.trim()) return;
    void ipc.historyAdd(state.resolvedFrom, target, text, state.result);
  }, [state.status, state.refining, state.result, state.resolvedFrom, target, text]);

  const togglePin = () => {
    setPinned(!pinned);
    void ipc.quickSetPinned(!pinned);
  };

  const replace = () =>
    ipc.quickReplace(state.result).catch((e: { code?: string }) => {
      if (e.code === "source_gone") setSourceGone(true);
    });

  const sourceLang = state.resolvedFrom ?? state.detected;
  const usable = packs.languages.filter((l) => l.installed || l.builtIn);
  const missing = state.error && (state.error.code === "pack_missing" || state.error.code === "model_load");
  const replaceDisabled = state.status !== "done" || !canReplace || sourceGone;

  const menu: MenuEntry[] = [
    {
      label: app ? t("quick.block", { app }) : t("quick.blockNone"),
      icon: "close",
      disabled: !app,
      onSelect: () => app && void ipc.quickBlockApp(app),
    },
  ];

  return (
    <div className="quick">
      <header className="quick__bar" data-tauri-drag-region>
        <LanguagePicker
          label={t("lang.target")}
          value={target}
          languages={usable}
          onChange={(code) => void patch({ targetLanguage: code })}
        />
        <span className="quick__spacer" data-tauri-drag-region />
        <IconButton
          icon="pin"
          label={pinned ? t("quick.unpin") : t("quick.pin")}
          aria-pressed={pinned}
          className={pinned ? "dw-iconbtn--on" : undefined}
          onClick={togglePin}
        />
        <IconButton icon="close" label={t("common.close")} onClick={() => void ipc.quickHide()} />
      </header>

      <section className="quick__source">
        <button type="button" className="quick__more" aria-expanded={showOriginal} onClick={() => setShowOriginal(!showOriginal)}>
          {showOriginal ? t(captured ? "quick.hideRecognized" : "quick.hideOriginal") : t(captured ? "quick.showRecognized" : "quick.showOriginal")}
          {showOriginal && sourceLang && <span className="quick__from"> · {t("lang.detected", { lang: languageName(sourceLang, locale) })}</span>}
        </button>
        {showOriginal && (
          <textarea
            ref={sourceRef}
            className="quick__input"
            value={text}
            placeholder={t("quick.empty")}
            spellCheck={false}
            dir="auto"
            aria-label={t("lang.source")}
            onChange={(e) => {
              setTyped(true);
              setText(e.target.value);
            }}
          />
        )}
      </section>

      <section className="quick__result" dir="auto" lang={target} aria-live="polite">
        {problem && !text && (
          <div className="pane__error" role="status">
            <Icon name="alert" size={20} />
            <span>{ocrProblemText(t, problem, (c) => languageName(c, locale))}</span>
            {problem.code === "no_text" && (
              <Button
                icon="scan"
                onClick={() => {
                  void ipc.quickHide();
                  void ipc.captureStart(false);
                }}
              >
                {t("quick.tryAgain")}
              </Button>
            )}
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
          <ResultText
            text={state.result}
            segments={state.status === "done" ? state.segments : []}
            from={state.resolvedFrom ?? "en"}
            to={state.effectiveTo ?? target}
            onPick={state.pick}
            dimmed={state.status === "translating" && !state.fresh}
          />
        )}
        {(state.status === "undetected" || state.status === "unavailable") && (
          <DetectionNotice state={state} packs={packs} onPickSource={setFrom} />
        )}
        {state.status === "error" && (
          <div className="pane__error" role="alert">
            <Icon name="alert" size={20} />
            <span>
              {missing
                ? t("text.packMissing", { lang: languageName(state.error?.message ?? "", locale) })
                : t("text.engineError")}
            </span>
            {missing && (
              <Button icon="package" onClick={() => void ipc.openSettings("packs")}>
                {t("menu.packs")}
              </Button>
            )}
          </div>
        )}
      </section>

      <footer className="quick__foot">
        <span className="pane__meta">
          {state.status === "translating" && state.result && <Spinner />}
          {state.status === "done" && state.pivoted && (
            <span className="pane__via" title={t("text.viaEnglishHint")}>
              <Icon name="swap" size={13} />
              {t("text.viaEnglish")}
            </span>
          )}
          {sourceGone && <span>{t("quick.sourceGone")}</span>}
        </span>
        <div className="pane__actions">
          <CopyButton text={state.status === "done" ? state.result : ""} />
          {!captured && <Button
            variant="ghost"
            icon="replace"
            disabled={replaceDisabled}
            title={sourceGone ? t("quick.sourceGone") : t("quick.replaceHint")}
            onClick={() => void replace()}
          >
            {t("quick.replace")}
          </Button>}
          <IconButton
            icon="external"
            label={t("quick.openInApp")}
            disabled={!text.trim()}
            onClick={() => void ipc.quickOpenInMain(text)}
          />
          <Menu label={t("quick.more")} icon="more" entries={menu} open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </footer>
    </div>
  );
}
