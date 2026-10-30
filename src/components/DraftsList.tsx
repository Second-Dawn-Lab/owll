import { Button, Icon, IconButton } from "@seconddawn/ui";
import { useCallback, useEffect, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, type DraftInfo } from "../ipc";

/** "2 hours ago", "yesterday", or the date: when a draft was last changed. */
function when(ms: number, locale: string): string {
  const diff = Date.now() - ms;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diff < 3_600_000) return rtf.format(-Math.max(1, Math.round(diff / 60_000)), "minute");
  if (diff < 86_400_000) return rtf.format(-Math.round(diff / 3_600_000), "hour");
  if (diff < 7 * 86_400_000) return rtf.format(-Math.round(diff / 86_400_000), "day");
  return new Date(ms).toLocaleDateString(locale);
}

/** The unfinished edits kept on this computer: continue or delete them. `refreshKey` changes when the editor closed. */
export function DraftsList({ refreshKey, onContinue }: { refreshKey: number; onContinue: (draftId: string) => void }) {
  const { t, locale } = useT();
  const [drafts, setDrafts] = useState<DraftInfo[]>([]);
  const load = useCallback(() => void ipc.draftsList().then(setDrafts).catch(() => setDrafts([])), []);
  useEffect(load, [load, refreshKey]);
  if (drafts.length === 0) return null;
  return (
    <section className="drafts" aria-label={t("drafts.title")}>
      <h3 className="drafts__title">{t("drafts.title")}</h3>
      <p className="files__hint">{t("drafts.hint")}</p>
      <ul className="drafts__list">
        {drafts.map((d) => (
          <li key={d.id} className="drafts__row">
            <Icon name="pencil" size={18} />
            <span className="drafts__name" title={d.path}>
              <strong>{d.name}</strong>
              <span className="files__hint">
                {languageName(d.from, locale)} {"\u2192"} {languageName(d.to, locale)} {"\u00b7"} {t("drafts.meta", { count: d.edited, when: when(d.updatedAt, locale) })}
                {d.status === "missing" && ` \u00b7 ${t("drafts.missing")}`}
                {d.status === "maybe_changed" && ` \u00b7 ${t("drafts.maybeChanged")}`}
              </span>
            </span>
            <Button variant="ghost" onClick={() => onContinue(d.id)}>
              {t("drafts.continue")}
            </Button>
            <IconButton
              icon="trash"
              label={t("drafts.delete")}
              onClick={() => {
                void ipc.draftDelete(d.id).then(load);
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
