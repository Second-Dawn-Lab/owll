import { useSettings } from "@seconddawn/settings";
import { Button, Icon, IconButton } from "@seconddawn/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, type LiveLine, type LiveStatus } from "../ipc";
import { settingsStore } from "../settings/store";
import { LanguagePicker } from "./LanguagePicker";
import { addLines, shownLines, transcriptText, type Caption } from "./liveLines";
import { usePacks } from "./usePacks";

/**
 * The caption bar: a small always-on-top window, excluded from screen capture, that shows the latest translated lines of the
 * watched region. It is transparent around a rounded surface, so it looks right in light and dark mode and over any video.
 * Controls appear on hover: pause, languages, history, lock (click-through), change region, settings and close.
 */
export function LiveBar() {
  const { t, locale } = useT();
  const { settings } = useSettings(settingsStore);
  const packs = usePacks();
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [status, setStatus] = useState<LiveStatus>({ state: "running", languages: [], message: "" });
  const [paused, setPaused] = useState(false);
  const [locked, setLocked] = useState(false);
  const [source, setSource] = useState("auto");
  const [target, setTarget] = useState("");
  const [history, setHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ipc.liveState().then((s) => {
      setPaused(s.paused);
      setLocked(s.locked);
      setSource(s.source);
      setTarget(s.target);
    });
    const offs = [
      ipc.onLiveLines((e) => {
        setCaptions((list) => addLines(list, e.lines as LiveLine[], e.replaceLast));
        setStatus((s) => (s.state === "running" || s.state === "no_text" ? s : { state: "running", languages: [], message: "" }));
      }),
      ipc.onLiveStatus((s) => {
        setStatus(s);
        setPaused(s.state === "paused");
      }),
      ipc.onLiveCleared(() => undefined),
      ipc.onLiveLocked((l) => setLocked(l)),
    ];
    return () => offs.forEach((off) => void off.then((fn) => fn()));
  }, []);

  // Esc closes the bar when it has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void ipc.liveStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The bar's size depends on the settings: ask the backend to place it again when they change.
  useEffect(() => {
    void ipc.liveReplaceBar();
  }, [settings.liveLines, settings.liveFontSize, settings.liveShowOriginal]);

  const usable = packs.languages.filter((l) => l.installed || l.builtIn);
  const shown = useMemo(() => shownLines(captions, settings.liveLines), [captions, settings.liveLines]);

  const chooseLanguages = useCallback((nextSource: string, nextTarget: string) => {
    setSource(nextSource);
    setTarget(nextTarget);
    void ipc.liveLanguages(nextSource, nextTarget);
  }, []);

  const exportTranscript = async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: "live-captions.txt", filters: [{ name: "Text", extensions: ["txt"] }] });
    if (path) await ipc.liveSaveText(path, transcriptText(captions));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transcriptText(captions));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* the clipboard is not available */
    }
  };

  const message = (() => {
    switch (status.state) {
      case "black":
        return t("live.black");
      case "ocr_missing":
        return t("live.ocrMissing", { lang: status.languages.map((l) => languageName(l, locale)).join(", ") });
      case "pack_missing":
        return t("live.packMissing", { lang: status.languages.map((l) => languageName(l, locale)).join(", ") });
      case "undetected":
        return t("live.undetected");
      case "error":
        return status.message || t("live.error");
      default:
        return "";
    }
  })();

  const style = { "--live-font": `${settings.liveFontSize}px`, "--live-opacity": String(settings.liveOpacity) } as React.CSSProperties;

  return (
    <div ref={rootRef} className={`livebar${locked ? " livebar--locked" : ""}${paused ? " livebar--paused" : ""}`} style={style} data-tauri-drag-region>
      <div className="livebar__tools" data-tauri-drag-region>
        <LanguagePicker label={t("lang.source")} value={source} languages={usable} allowAuto onChange={(code) => chooseLanguages(code, target)} />
        <span aria-hidden="true">{"→"}</span>
        <LanguagePicker label={t("lang.target")} value={target} languages={usable} onChange={(code) => chooseLanguages(source, code)} />
        <span className="livebar__spacer" data-tauri-drag-region />
        <IconButton icon={paused ? "play" : "pause"} label={paused ? t("live.resume") : t("live.pause")} onClick={() => void ipc.livePause(!paused)} />
        <IconButton icon="clock" label={t("live.history")} onClick={() => setHistory((h) => !h)} />
        <IconButton icon="scan" label={t("live.changeRegion")} onClick={() => void ipc.liveChangeRegion()} />
        <IconButton
          icon="shield"
          label={t("live.lock")}
          onClick={() => {
            setLocked(true);
            void ipc.liveLock(true);
          }}
        />
        <IconButton icon="settings" label={t("live.settings")} onClick={() => void ipc.openSettings("files")} />
        <IconButton icon="close" label={t("live.close")} onClick={() => void ipc.liveStop()} />
      </div>

      {history ? (
        <div className="livebar__history">
          <div className="livebar__historybar">
            <strong>{t("live.history")}</strong>
            <Button variant="ghost" onClick={() => void copy()}>
              {copied ? t("action.copied") : t("action.copy")}
            </Button>
            <Button variant="ghost" icon="download" onClick={() => void exportTranscript()}>
              {t("live.export")}
            </Button>
            <Button variant="ghost" onClick={() => setHistory(false)}>
              {t("common.close")}
            </Button>
          </div>
          <ul>
            {captions.length === 0 && <li className="livebar__hint">{t("live.waiting")}</li>}
            {captions.map((c) => (
              <li key={c.id} dir="auto">
                {c.translation}
                <span className="livebar__orig">{c.original}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="livebar__lines" aria-live="polite" data-tauri-drag-region>
          {message ? (
            <p className="livebar__message">
              <Icon name="alert" size={18} /> {message}
              {(status.state === "ocr_missing" || status.state === "pack_missing") && (
                <Button variant="ghost" onClick={() => void (status.state === "ocr_missing" ? ipc.openWindowsLanguageSettings() : ipc.openSettings("packs"))}>
                  {t(status.state === "ocr_missing" ? "ocr.install" : "packs.download")}
                </Button>
              )}
            </p>
          ) : shown.length === 0 ? (
            <p className="livebar__hint">{paused ? t("live.paused") : t("live.waiting")}</p>
          ) : (
            shown.map((c) => (
              <div key={c.id} className="livebar__line" dir="auto">
                {settings.liveShowOriginal && <div className="livebar__original">{c.original}</div>}
                <div className="livebar__translation">{c.translation}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
