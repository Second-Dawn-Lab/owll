import { useSettings } from "@seconddawn/settings";
import { Button, Checkbox, Icon, IconButton } from "@seconddawn/ui";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, type LiveLine, type LiveStatus } from "../ipc";
import { settingsStore } from "../settings/store";
import { LanguagePicker } from "./LanguagePicker";
import { addLines, choiceToRemember, clock, decideSave, timeRange, transcriptText, type Caption } from "./liveLines";
import { atBottom, endOf, initialScroll, jump, onLines, onScroll, showJump, type ScrollState } from "./scrollModel";
import { usePacks } from "./usePacks";

/**
 * The caption bar: a small always-on-top window, excluded from screen capture, with the conversation of the session. It follows the
 * newest line while the reader is at the bottom; scrolling up stops that and offers "Jump to latest". When the session ends it asks
 * whether to keep the conversation in the History. Controls appear on hover; lists open in a window of their own (the bar is small).
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
  const [scroll, setScroll] = useState<ScrollState>(initialScroll);
  const [copied, setCopied] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  /** The session ended: the bar keeps the conversation and asks what to do with it. */
  const [ended, setEnded] = useState<{ at: number } | null>(null);
  const [remember, setRemember] = useState(false);
  const [note, setNote] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  // Event handlers outlive renders: they read the latest values from here.
  const live = useRef({ captions, startedAt, from: "", to: "", choice: settings.liveSaveChoice });
  live.current.captions = captions;
  live.current.startedAt = startedAt;
  live.current.choice = settings.liveSaveChoice;

  const closeBar = useCallback(() => void ipc.liveClose(), []);

  const save = useCallback(
    async (answer: boolean, rememberIt: boolean) => {
      const { captions: all, startedAt: began, from, to } = live.current;
      const choice = choiceToRemember(answer, rememberIt);
      if (choice) await ipc.liveSetSaveChoice(choice).catch(() => undefined);
      if (answer) {
        const kept = await ipc.liveSaveSession(from || source, to || target, began, all.map((c) => ({ t: c.at, original: c.original, translation: c.translation }))).catch(() => false);
        setNote(kept ? t("live.saved") : t("live.notSaved"));
        setTimeout(closeBar, 1400);
      } else {
        closeBar();
      }
    },
    [closeBar, source, target, t],
  );

  useEffect(() => {
    void ipc.liveState().then((s) => {
      setPaused(s.paused);
      setLocked(s.locked);
      setSource(s.source);
      setTarget(s.target);
      if (s.startedAt) setStartedAt(s.startedAt);
    });
    const offs = [
      ipc.onLiveLines((e) => {
        live.current.from = e.from;
        live.current.to = e.to;
        setCaptions((list) => addLines(list, e.lines as LiveLine[], e.replaceLast));
        setScroll((s) => onLines(s, e.replaceLast ? Math.max(0, e.lines.length - 1) : e.lines.length));
        setStatus((s) => (s.state === "running" || s.state === "no_text" ? s : { state: "running", languages: [], message: "" }));
      }),
      ipc.onLiveStatus((s) => {
        setStatus(s);
        setPaused(s.state === "paused");
      }),
      ipc.onLiveLocked((l) => setLocked(l)),
      ipc.onLiveReset((began) => {
        setCaptions([]);
        setScroll(initialScroll);
        setEnded(null);
        setNote("");
        setRemember(false);
        setStartedAt(began);
        setStatus({ state: "running", languages: [], message: "" });
      }),
      ipc.onLiveEnded((at) => {
        const all = live.current.captions;
        const what = decideSave(live.current.choice, all.length);
        if (what === "nothing" || what === "skip") closeBar();
        else if (what === "save") void save(true, false);
        else setEnded({ at });
        void at;
      }),
    ];
    return () => offs.forEach((off) => void off.then((fn) => fn()));
  }, []);

  // Esc: stops the session, or closes the bar once it has ended.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void (ended ? ipc.liveClose() : ipc.liveStop());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ended]);

  // The bar's initial size follows these settings (a size the user dragged to is kept by the backend).
  useEffect(() => {
    void ipc.liveReplaceBar();
  }, [settings.liveLines, settings.liveFontSize, settings.liveShowOriginal]);

  // Follow the newest line while the reader is at the bottom.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && scroll.following) el.scrollTop = endOf(el);
  }, [captions, scroll.following, ended]);

  const onListScroll = () => {
    const el = listRef.current;
    if (el) setScroll((s) => onScroll(s, atBottom(el)));
  };

  const jumpToLatest = () => {
    const el = listRef.current;
    if (el) el.scrollTop = endOf(el);
    setScroll(jump());
  };

  const usable = packs.languages.filter((l) => l.installed || l.builtIn);

  const chooseLanguages = useCallback((nextSource: string, nextTarget: string) => {
    setSource(nextSource);
    setTarget(nextTarget);
    void ipc.liveLanguages(nextSource, nextTarget);
  }, []);

  const exportTranscript = async () => {
    const { save: saveDialog } = await import("@tauri-apps/plugin-dialog");
    const path = await saveDialog({ defaultPath: "live-captions.txt", filters: [{ name: "Text", extensions: ["txt"] }] });
    if (path) await ipc.liveSaveText(path, transcriptText(captions, locale));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transcriptText(captions, locale));
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
    <div className={`livebar${locked ? " livebar--locked" : ""}${paused ? " livebar--paused" : ""}`} style={style} data-tauri-drag-region>
      <div className="livebar__tools" data-tauri-drag-region>
        <LanguagePicker label={t("lang.source")} value={source} languages={usable} allowAuto onChange={(code) => chooseLanguages(code, target)} />
        <span aria-hidden="true">{"→"}</span>
        <LanguagePicker label={t("lang.target")} value={target} languages={usable} onChange={(code) => chooseLanguages(source, code)} />
        <span className="livebar__spacer" data-tauri-drag-region />
        {!ended && <IconButton icon={paused ? "play" : "pause"} label={paused ? t("live.resume") : t("live.pause")} onClick={() => void ipc.livePause(!paused)} />}
        <IconButton icon="copy" label={copied ? t("action.copied") : t("live.copyAll")} onClick={() => void copy()} />
        <IconButton icon="download" label={t("live.export")} onClick={() => void exportTranscript()} />
        {!ended && <IconButton icon="scan" label={t("live.changeRegion")} onClick={() => void ipc.liveChangeRegion()} />}
        {!ended && (
          <IconButton
            icon="shield"
            label={t("live.lock")}
            onClick={() => {
              setLocked(true);
              void ipc.liveLock(true);
            }}
          />
        )}
        <IconButton icon="settings" label={t("live.settings")} onClick={() => void ipc.openSettings("files")} />
        <IconButton icon="close" label={ended ? t("live.closeBar") : t("live.close")} onClick={() => void (ended ? ipc.liveClose() : ipc.liveStop())} />
      </div>

      <div className="livebar__scroller">
        <div className="livebar__lines" ref={listRef} onScroll={onListScroll} aria-live="polite" role="log" data-tauri-drag-region>
          {captions.length === 0 &&
            (message ? (
              <p className="livebar__message">
                <Icon name="alert" size={18} /> {message}
                {(status.state === "ocr_missing" || status.state === "pack_missing") && (
                  <Button variant="ghost" onClick={() => void (status.state === "ocr_missing" ? ipc.openWindowsLanguageSettings() : ipc.openSettings("packs"))}>
                    {t(status.state === "ocr_missing" ? "ocr.install" : "packs.download")}
                  </Button>
                )}
              </p>
            ) : (
              <p className="livebar__hint">{paused ? t("live.paused") : t("live.waiting")}</p>
            ))}
          {captions.map((c) => (
            <div key={c.id} className="livebar__line" dir="auto">
              <span className="livebar__time">{clock(c.at, locale)}</span>
              <div className="livebar__translation">{c.translation}</div>
              {settings.liveShowOriginal && <div className="livebar__original">{c.original}</div>}
            </div>
          ))}
          {captions.length > 0 && message && (
            <p className="livebar__message">
              <Icon name="alert" size={18} /> {message}
            </p>
          )}
        </div>
        {showJump(scroll) && (
          <button type="button" className="livebar__jump" onClick={jumpToLatest}>
            <Icon name="chevron" size={14} /> {scroll.unseen > 0 ? t("live.jumpCount", { count: scroll.unseen }) : t("live.jump")}
          </button>
        )}
      </div>

      {ended && (
        <div className="livebar__ended" role="alertdialog" aria-label={t("live.endedTitle")}>
          {note ? (
            <strong>{note}</strong>
          ) : (
            <>
              <div>
                <strong>{t("live.endedTitle")}</strong>
                <div className="livebar__hint">{t("live.endedBody", { count: captions.length, range: timeRange(startedAt, ended.at, locale) })}</div>
              </div>
              <div className="livebar__answers">
                <Checkbox checked={remember} onChange={setRemember}>
                  {t("live.remember")}
                </Checkbox>
                <Button onClick={() => void save(false, remember)}>{t("live.dontSave")}</Button>
                <Button variant="primary" onClick={() => void save(true, remember)}>
                  {t("live.save")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
