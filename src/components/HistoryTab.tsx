import { useSettings } from "@seconddawn/settings";
import { Button, EmptyState, Icon, IconButton, Dialog } from "@seconddawn/ui";
import { useCallback, useEffect, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, type HistoryEntry } from "../ipc";
import { settingsStore } from "../settings/store";
import { CopyButton } from "./CopyButton";

function timeAgo(ms: number, locale: string): string {
  const seconds = Math.round((ms - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "second");
}

export function HistoryTab(props: { onUse: (entry: HistoryEntry) => void }) {
  const { t, locale } = useT();
  const { settings } = useSettings(settingsStore);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [confirm, setConfirm] = useState(false);

  const refresh = useCallback(() => void ipc.historyList().then(setEntries), []);
  useEffect(() => {
    refresh();
    const unlisten = ipc.onHistoryChanged(refresh);
    return () => void unlisten.then((fn) => fn());
  }, [refresh]);

  return (
    <div className="history">
      {!settings.keepHistory && (
        <div className="note note--box">
          <Icon name="info" size={18} />
          <div>
            <strong>{t("history.off")}</strong>
            <div>{t("history.offHint")}</div>
          </div>
          <Button onClick={() => void ipc.openSettings("files")}>{t("history.openSettings")}</Button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="card-center">
          <EmptyState icon="clock" title={t("history.empty")}>
            {t("history.emptyHint")}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="history__bar">
            <Button variant="ghost" icon="trash" onClick={() => setConfirm(true)}>
              {t("history.clear")}
            </Button>
          </div>
          <ul className="history__list">
            {entries.map((e) => (
              <li key={e.id} className="entry">
                <div className="entry__head">
                  <span className="entry__langs">
                    {languageName(e.from, locale)} → {languageName(e.to, locale)}
                  </span>
                  <span className="entry__time">{timeAgo(e.createdAt, locale)}</span>
                  <span className="entry__spacer" />
                  <Button variant="ghost" onClick={() => props.onUse(e)}>
                    {t("history.use")}
                  </Button>
                  <CopyButton text={e.result} />
                  <IconButton icon="trash" label={t("history.delete")} onClick={() => void ipc.historyDelete(e.id)} />
                </div>
                <p className="entry__source" dir="auto">{e.source}</p>
                <p className="entry__result" dir="auto">{e.result}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog
        open={confirm}
        title={t("history.confirmTitle")}
        onClose={() => setConfirm(false)}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              onClick={() => {
                void ipc.historyClear();
                setConfirm(false);
              }}
            >
              {t("history.clear")}
            </Button>
          </>
        }
      >
        <p>{t("history.confirmBody")}</p>
      </Dialog>
    </div>
  );
}
