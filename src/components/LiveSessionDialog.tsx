import { Button, Dialog } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, type HistoryEntry } from "../ipc";
import { clock, timeRange, transcriptText } from "./liveLines";

type Line = { t: number; original: string; translation: string };

/** A saved live captions session: the whole conversation (original, translation, time) with Copy and Export. */
export function LiveSessionDialog({ entry, onClose }: { entry: HistoryEntry | null; onClose: () => void }) {
  const { t, locale } = useT();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLines(null);
    if (entry) void ipc.historySession(entry.id).then(setLines).catch(() => setLines([]));
  }, [entry?.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transcriptText(lines ?? [], locale));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* the clipboard is not available */
    }
  };

  const exportText = async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: "live-captions.txt", filters: [{ name: "Text", extensions: ["txt"] }] });
    if (path) await ipc.liveSaveText(path, transcriptText(lines ?? [], locale));
  };

  const title = entry ? t("history.live.title", { range: timeRange(entry.startedAt ?? 0, entry.endedAt ?? 0, locale), from: languageName(entry.from, locale), to: languageName(entry.to, locale), count: entry.lineCount ?? 0 }) : "";

  return (
    <Dialog
      open={!!entry}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={() => void copy()} disabled={!lines?.length}>
            {copied ? t("action.copied") : t("live.copyAll")}
          </Button>
          <Button icon="download" onClick={() => void exportText()} disabled={!lines?.length}>
            {t("live.export")}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </>
      }
    >
      <ul className="session">
        {(lines ?? []).map((l, i) => (
          <li key={i} dir="auto">
            <span className="session__time">{clock(l.t, locale)}</span>
            <span className="session__translation">{l.translation}</span>
            <span className="session__original">{l.original}</span>
          </li>
        ))}
        {lines !== null && lines.length === 0 && <li className="session__original">{t("history.empty")}</li>}
      </ul>
    </Dialog>
  );
}
